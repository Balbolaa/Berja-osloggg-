import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { LatLngBounds, circle as leafletCircle } from 'leaflet';
import { Filter, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchApprovedVerificationUserIds } from '@/integrations/supabase/verificationLookup';
import { findOverlappingTask, formatTaskDuration } from '@/lib/taskScheduling';
import { toast } from 'sonner';
import Logo from '@/components/service-finder/Logo';
import BottomNav from '@/components/service-finder/BottomNav';
import type { Tables } from '@/integrations/supabase/types';

type TaskWithRequester = Tables<'tasks'> & {
  requesterProfile?: Tables<'profiles'>;
  requesterVerified?: boolean;
};

type TaskMarker = {
  taskId: string;
  title: string;
  location: string;
  requesterName: string;
  requesterVerified: boolean;
  lat: number;
  lng: number;
};

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423];
const GEOCODE_CACHE_PREFIX = 'task_geocode:';
const NEARBY_RADIUS_METERS = 1000;

const isValidCoordinatePair = (
  coordinates: [number, number] | null,
): coordinates is [number, number] =>
  Boolean(
    coordinates &&
      Number.isFinite(coordinates[0]) &&
      Number.isFinite(coordinates[1]),
  );

const getInitials = (fullName?: string | null) =>
  fullName
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'З';

const readCachedCoordinates = (location: string) => {
  if (typeof window === 'undefined') return null;

  const rawValue = window.localStorage.getItem(`${GEOCODE_CACHE_PREFIX}${location}`);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as { lat: number; lng: number };
    if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
};

const saveCachedCoordinates = (location: string, lat: number, lng: number) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${GEOCODE_CACHE_PREFIX}${location}`, JSON.stringify({ lat, lng }));
};

const geocodeLocation = async (location: string) => {
  const cachedCoordinates = readCachedCoordinates(location);
  if (cachedCoordinates) return cachedCoordinates;

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`,
  );

  if (!response.ok) {
    throw new Error('Не удалось определить координаты задачи');
  }

  const results = (await response.json()) as Array<{ lat: string; lon: string }>;
  const firstResult = results[0];
  if (!firstResult) return null;

  const lat = Number(firstResult.lat);
  const lng = Number(firstResult.lon);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  saveCachedCoordinates(location, lat, lng);
  return { lat, lng };
};

const getDistanceMeters = (first: { lat: number; lng: number }, second: { lat: number; lng: number }) => {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(second.lat - first.lat);
  const deltaLng = toRadians(second.lng - first.lng);
  const firstLat = toRadians(first.lat);
  const secondLat = toRadians(second.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const FitMapToMarkers = ({
  markers,
  nearbyCenter,
  nearbyOnly,
}: {
  markers: TaskMarker[];
  nearbyCenter: [number, number] | null;
  nearbyOnly: boolean;
}) => {
  const map = useMap();

  useEffect(() => {
    if (nearbyOnly && isValidCoordinatePair(nearbyCenter)) {
      try {
        const radiusBounds = leafletCircle(nearbyCenter, { radius: NEARBY_RADIUS_METERS }).getBounds();
        map.fitBounds(radiusBounds, { padding: [24, 24] });
      } catch {
        map.setView(nearbyCenter, 14);
      }
      return;
    }

    if (!markers.length) {
      map.setView(DEFAULT_CENTER, 5);
      return;
    }

    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 13);
      return;
    }

    const bounds = new LatLngBounds(markers.map((marker) => [marker.lat, marker.lng]));
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [map, markers, nearbyCenter, nearbyOnly]);

  return null;
};

const fetchVolunteerOverlappingTask = async (
  volunteerId: string,
  candidateTask: Tables<'tasks'>,
  excludeTaskId?: string,
) => {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_volunteer_id', volunteerId)
    .in('status', ['assigned', 'in_progress']);

  const filteredTasks = (data ?? []).filter((item) => item.id !== excludeTaskId);
  return findOverlappingTask(filteredTasks, candidateTask);
};

const fetchVolunteerAcceptedTasks = async (volunteerId: string) => {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_volunteer_id', volunteerId)
    .in('status', ['assigned', 'in_progress'])
    .order('updated_at', { ascending: false });

  return data ?? [];
};

const fetchVolunteerAppliedTaskIds = async (volunteerId: string) => {
  const { data } = await supabase
    .from('task_applications')
    .select('task_id')
    .eq('volunteer_id', volunteerId);

  return new Set((data ?? []).map((application) => application.task_id));
};

const TaskBoard = () => {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskWithRequester[]>([]);
  const [markers, setMarkers] = useState<TaskMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapping, setMapping] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [acceptedTasks, setAcceptedTasks] = useState<Tables<'tasks'>[]>([]);
  const [appliedTaskIds, setAppliedTaskIds] = useState<Set<string>>(new Set());
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [timeFromFilter, setTimeFromFilter] = useState('');
  const [timeToFilter, setTimeToFilter] = useState('');
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.category).filter(Boolean))).sort(),
    [tasks],
  );

  const overlappingTaskIds = useMemo(
    () =>
      new Set(
        tasks
          .filter((task) => Boolean(findOverlappingTask(acceptedTasks.filter((acceptedTask) => acceptedTask.id !== task.id), task)))
          .map((task) => task.id),
      ),
    [acceptedTasks, tasks],
  );

  useEffect(() => {
    const fetchTasks = async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      const taskRows = data ?? [];

      if (taskRows.length) {
        const requesterIds = [...new Set(taskRows.map((task) => task.requester_id))];
        const [profilesResult, approvedSet] = await Promise.all([
          supabase.from('profiles').select('*').in('user_id', requesterIds),
          fetchApprovedVerificationUserIds(requesterIds),
        ]);
        const profiles = profilesResult.data ?? [];

        setTasks(
          taskRows.map((task) => ({
            ...task,
            requesterProfile: profiles.find((profile) => profile.user_id === task.requester_id),
            requesterVerified: approvedSet.has(task.requester_id),
          })),
        );
      } else {
        setTasks([]);
      }

      setLoading(false);
    };

    fetchTasks();
  }, []);

  useEffect(() => {
    if (!user) {
      setAcceptedTasks([]);
      setAppliedTaskIds(new Set());
      return;
    }

    const fetchVolunteerState = async () => {
      const [nextAcceptedTasks, nextAppliedTaskIds] = await Promise.all([
        fetchVolunteerAcceptedTasks(user.id),
        fetchVolunteerAppliedTaskIds(user.id),
      ]);

      setAcceptedTasks(nextAcceptedTasks);
      setAppliedTaskIds(nextAppliedTaskIds);
    };

    fetchVolunteerState();
  }, [user]);

  useEffect(() => {
    const buildMarkers = async () => {
      const tasksWithLocations = tasks.filter((task) => task.location?.trim());

      if (!tasksWithLocations.length) {
        setMarkers([]);
        setMapping(false);
        return;
      }

      setMapping(true);

      const markerResults = await Promise.all(
        tasksWithLocations.map(async (task) => {
          try {
            const coordinates =
              typeof task.latitude === 'number' && typeof task.longitude === 'number'
                ? { lat: task.latitude, lng: task.longitude }
                : await geocodeLocation(task.location!.trim());
            if (!coordinates) return null;

            return {
              taskId: task.id,
              title: task.title,
              location: task.location!.trim(),
              requesterName: task.requesterProfile?.full_name || 'Заказчик',
              requesterVerified: Boolean(task.requesterVerified),
              lat: coordinates.lat,
              lng: coordinates.lng,
            } satisfies TaskMarker;
          } catch {
            return null;
          }
        }),
      );

      setMarkers(markerResults.filter((marker): marker is TaskMarker => Boolean(marker)));
      setMapping(false);
    };

    buildMarkers();
  }, [tasks]);

  const markerByTaskId = useMemo(
    () => new Map(markers.map((marker) => [marker.taskId, marker])),
    [markers],
  );

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return tasks.filter((task) => {
      if (categoryFilter !== 'all' && task.category !== categoryFilter) {
        return false;
      }

      if (dateFilter && task.preferred_date !== dateFilter) {
        return false;
      }

      if (timeFromFilter && (!task.preferred_time || task.preferred_time < timeFromFilter)) {
        return false;
      }

      if (timeToFilter && (!task.preferred_time || task.preferred_time > timeToFilter)) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = [task.title, task.description, task.location, task.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      if (nearbyOnly) {
        if (!userLocation) return false;
        const marker = markerByTaskId.get(task.id);
        if (!marker) return false;

        return getDistanceMeters(
          { lat: userLocation[0], lng: userLocation[1] },
          { lat: marker.lat, lng: marker.lng },
        ) <= NEARBY_RADIUS_METERS;
      }

      return true;
    });
  }, [categoryFilter, dateFilter, markerByTaskId, nearbyOnly, searchText, tasks, timeFromFilter, timeToFilter, userLocation]);

  const filteredTaskIds = useMemo(
    () => new Set(filteredTasks.map((task) => task.id)),
    [filteredTasks],
  );

  const filteredMarkers = useMemo(
    () => markers.filter((marker) => filteredTaskIds.has(marker.taskId)),
    [filteredTaskIds, markers],
  );

  const tasksWithLocationCount = useMemo(
    () => filteredTasks.filter((task) => Boolean(task.location?.trim())).length,
    [filteredTasks],
  );

  const hasActiveFilter =
    Boolean(searchText.trim()) ||
    categoryFilter !== 'all' ||
    Boolean(dateFilter) ||
    Boolean(timeFromFilter) ||
    Boolean(timeToFilter) ||
    nearbyOnly;

  const handleApply = async (event: React.MouseEvent<HTMLButtonElement>, taskId: string) => {
    event.stopPropagation();
    const candidateTask = tasks.find((task) => task.id === taskId);
    if (!candidateTask) {
      toast.error('Не удалось найти задачу');
      return;
    }

    if (overlappingTaskIds.has(taskId)) {
      toast.error('Вы уже приняты на другую задачу');
      return;
    }

    setApplying(taskId);

    const { data: sessionData } = await supabase.auth.getUser();
    const currentUser = sessionData.user;

    if (!currentUser) {
      toast.error('Сначала войдите в аккаунт');
      setApplying(null);
      return;
    }

    const overlappingTask = await fetchVolunteerOverlappingTask(currentUser.id, candidateTask, taskId);
    if (overlappingTask) {
      toast.error('Вы уже приняты на другую задачу');
      setApplying(null);
      return;
    }

    const { error } = await supabase.from('task_applications').insert({
      task_id: taskId,
      volunteer_id: currentUser.id,
      message: 'Я готов(а) помочь!',
    });

    if (error) {
      if (error.code === '23505') {
        setAppliedTaskIds((currentTaskIds) => new Set(currentTaskIds).add(taskId));
        toast.error('Вы уже откликнулись на эту задачу');
      } else {
        toast.error('Ошибка при отклике');
      }
    } else {
      setAppliedTaskIds((currentTaskIds) => new Set(currentTaskIds).add(taskId));
      toast.success('Отклик отправлен!');
    }

    setApplying(null);
  };

  const toggleNearbyTasks = () => {
    if (nearbyOnly) {
      setNearbyOnly(false);
      return;
    }

    if (!navigator.geolocation) {
      toast.error('Браузер не поддерживает определение местоположения');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: [number, number] = [position.coords.latitude, position.coords.longitude];

        if (!isValidCoordinatePair(nextLocation)) {
          toast.error('Не удалось определить ваше местоположение');
          return;
        }

        setUserLocation(nextLocation);
        setNearbyOnly(true);
      },
      () => {
        toast.error('Не удалось определить ваше местоположение');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const clearFilters = () => {
    setSearchText('');
    setCategoryFilter('all');
    setDateFilter('');
    setTimeFromFilter('');
    setTimeToFilter('');
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  if (loading) return <p className="p-8 text-center text-body">Загрузка...</p>;

  return (
    <div className="sf-theme relative h-screen w-full overflow-hidden animate-fade-in">
      {filteredTasks.length === 0 && !tasks.length ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 text-center">
          <div className="rounded-xl border border-slate-200 bg-white/95 px-6 py-4 text-sm text-slate-600 shadow-lg">
            Сейчас нет открытых задач
          </div>
        </div>
      ) : null}

      <div className="relative h-full w-full">
        <MapContainer center={DEFAULT_CENTER} zoom={5} className="h-full w-full sf-map">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <FitMapToMarkers markers={filteredMarkers} nearbyCenter={userLocation} nearbyOnly={nearbyOnly} />

                  {nearbyOnly && isValidCoordinatePair(userLocation) && (
                    <Circle
                      center={userLocation}
                      radius={NEARBY_RADIUS_METERS}
                      pathOptions={{ color: '#dc2626', fillColor: '#f87171', fillOpacity: 0.12, weight: 2 }}
                    />
                  )}

                  {filteredMarkers.map((marker) => {
                    const selected = marker.taskId === selectedTaskId;

                    return (
                      <CircleMarker
                        key={marker.taskId}
                        center={[marker.lat, marker.lng]}
                        radius={selected ? 12 : 9}
                        pathOptions={{
                          color: selected ? '#0f766e' : '#0284c7',
                          fillColor: selected ? '#14b8a6' : '#38bdf8',
                          fillOpacity: 0.9,
                          weight: 3,
                        }}
                        eventHandlers={{
                          click: () => {
                            setSelectedTaskId(marker.taskId);
                            navigate(`/task/${marker.taskId}`);
                          },
                          mouseover: () => setSelectedTaskId(marker.taskId),
                        }}
                      >
                        <Popup>
                          <div className="space-y-1">
                            <p className="font-bold">{marker.title}</p>
                            <p className="text-sm text-muted-foreground">{marker.location}</p>
                            <p className="text-sm">
                              {marker.requesterVerified ? 'Подтвержденный заказчик' : marker.requesterName}
                            </p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
        </MapContainer>

        <div className="absolute inset-0 z-30 pointer-events-none">
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-white/92 px-3 py-2 shadow-lg backdrop-blur">
            <Logo size="sm" />
          </div>

          <button
            type="button"
            className="burger-btn absolute right-3 top-3 pointer-events-auto"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            {hasActiveFilter && <span className="burger-dot" />}
            <span className="burger-line" />
            <span className="burger-line" />
            <span className="burger-line" />
          </button>

          <div className="pointer-events-auto">
            <BottomNav roles={roles as Array<'volunteer' | 'requester' | 'moderator'>} />
          </div>
        </div>

        {menuOpen && (
          <>
            <div
              onClick={closeMenu}
              style={{ position: 'fixed', inset: 0, zIndex: 25, background: 'rgba(0,0,0,0.18)' }}
            />
            <div
              className="fade-in"
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 320,
                background: '#fff',
                zIndex: 30,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '-6px 0 28px rgba(0,0,0,0.18)',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #f0e0e2' }}>
                <Logo size="sm" />
                <button onClick={closeMenu} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#888', lineHeight: 1 }}>✕</button>
              </div>

              <div style={{ padding: '14px 14px 0' }}>
                <button
                  onClick={() => setFilterDialogOpen(!filterDialogOpen)}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    background: filterDialogOpen ? '#1B2CC1' : '#FDE8EA',
                    color: filterDialogOpen ? '#fff' : '#1B2CC1',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontWeight: 700,
                    fontSize: 15,
                    marginBottom: 8,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Filter className="h-4 w-4" />
                  Filter requests
                </button>

                {filterDialogOpen && (
                  <div className="fade-in" style={{ background: '#FDE8EA', borderRadius: 10, padding: '16px 14px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.6 }}>Search</div>
                      <div style={{ position: 'relative' }}>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          className="field-input"
                          placeholder="Title, address..."
                          value={searchText}
                          onChange={(event) => setSearchText(event.target.value)}
                          style={{ paddingLeft: 32, fontSize: 13, background: '#fff' }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.6 }}>Category</div>
                      <select
                        value={categoryFilter}
                        onChange={(event) => setCategoryFilter(event.target.value)}
                        className="field-input"
                        style={{ fontSize: 13, background: '#fff' }}
                      >
                        <option value="all">All categories</option>
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.6 }}>Date & Time</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="date" className="field-input" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} style={{ flex: 1, fontSize: 12, background: '#fff' }} />
                        <input type="time" className="field-input" value={timeFromFilter} onChange={(event) => setTimeFromFilter(event.target.value)} style={{ flex: 1, fontSize: 12, background: '#fff' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={clearFilters} style={{ flex: '0 0 auto', padding: '10px 16px', background: '#fff', border: '1.5px solid #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>Clear</button>
                      <button onClick={() => setFilterDialogOpen(false)} style={{ flex: 1, padding: '10px', background: '#1B2CC1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Apply</button>
                    </div>

                    <button
                      onClick={toggleNearbyTasks}
                      style={{ padding: '10px', background: nearbyOnly ? '#1B2CC1' : '#fff', color: nearbyOnly ? '#fff' : '#1B2CC1', border: '1.5px solid #1B2CC1', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {nearbyOnly ? 'Show all tasks' : 'Find nearby tasks'}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, background: '#FDE8EA', borderTop: '1px solid #f0c0c4', marginTop: 4 }}>
                {filteredTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: 14 }}>No requests found</div>
                ) : (
                  filteredTasks.map((task) => {
                    const isSelected = selectedTaskId === task.id;
                    const isApplied = appliedTaskIds.has(task.id);
                    const isOverlapping = overlappingTaskIds.has(task.id);
                    const canApplyHere = !isApplied && !isOverlapping;
                    return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      style={{
                        borderBottom: '1px solid rgba(200,140,145,0.3)',
                        padding: '14px 16px',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(255,255,255,0.7)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: '50%',
                            background: '#c8b0b0',
                            flexShrink: 0,
                            border: '2px solid rgba(255,255,255,0.7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 21,
                            color: '#888',
                          }}
                        >
                          {task.title?.[0] ?? 'T'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', marginBottom: 2 }}>
                            {task.title}
                          </div>
                          <div style={{ fontSize: 13, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {task.description || 'No description'}
                          </div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>📍 {task.location || 'No location'}</div>
                        </div>
                      </div>

                      {isSelected && (
                        <div style={{ marginTop: 12, background: '#fff', borderRadius: 10, border: '1px solid #f0c0c4', padding: 12 }}>
                          <div style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>
                            {task.description || 'No description'}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#666' }}>
                            <span style={{ background: '#FDE8EA', padding: '4px 8px', borderRadius: 8 }}>📍 {task.location || 'No location'}</span>
                            {task.preferred_date && (
                              <span style={{ background: '#FDE8EA', padding: '4px 8px', borderRadius: 8 }}>📅 {task.preferred_date}</span>
                            )}
                            {task.preferred_time && (
                              <span style={{ background: '#FDE8EA', padding: '4px 8px', borderRadius: 8 }}>⏰ {task.preferred_time}</span>
                            )}
                            <span style={{ background: '#FDE8EA', padding: '4px 8px', borderRadius: 8 }}>⏳ {formatTaskDuration(task.duration_minutes)}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                closeMenu();
                                navigate(`/task/${task.id}`);
                              }}
                              style={{ flex: 1, padding: '8px 10px', background: '#fff', border: '1.5px solid #1B2CC1', borderRadius: 8, color: '#1B2CC1', fontWeight: 700, fontSize: 13 }}
                            >
                              View Details
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleApply(event as unknown as React.MouseEvent<HTMLButtonElement>, task.id);
                              }}
                              disabled={!canApplyHere}
                              style={{
                                flex: 1,
                                padding: '8px 10px',
                                background: canApplyHere ? '#1B2CC1' : '#9aa0c9',
                                border: 'none',
                                borderRadius: 8,
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: canApplyHere ? 'pointer' : 'not-allowed',
                              }}
                            >
                              {isApplied ? 'Applied' : isOverlapping ? 'Busy' : 'Help Out!'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
                )}
              </div>
            </div>
          </>
        )}

        {mapping && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-white/90 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
            Определяем адреса задач и ставим метки на карту...
          </div>
        )}

        {!mapping && !filteredMarkers.length && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-white/90 px-3 py-2 text-xs leading-snug text-muted-foreground shadow-lg backdrop-blur">
            Для текущего фильтра на карте нет задач. Попробуйте изменить фильтр или показать все задачи.
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskBoard;
