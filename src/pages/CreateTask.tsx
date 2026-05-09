import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { LatLngExpression } from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatTaskDuration } from "@/lib/taskScheduling";
import { toast } from "sonner";
import Logo from "@/components/service-finder/Logo";
import SoftPinkBackground from "@/components/service-finder/SoftPinkBackground";
import locationPin from "@/assets/service-finder/location_icon_on_map_png_1775649698180.png";

const CATEGORIES = [
  { value: "shopping", label: "Покупки" },
  { value: "cleaning", label: "Уборка" },
  { value: "transport", label: "Транспорт" },
  { value: "medical", label: "Медицина" },
  { value: "tech", label: "Техника" },
  { value: "other", label: "Другое" },
];

const DEFAULT_CENTER: LatLngExpression = [55.751244, 37.618423];

const reverseGeocode = async (lat: number, lng: number) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
  );

  if (!response.ok) {
    throw new Error("Не удалось определить адрес по точке на карте");
  }

  const payload = (await response.json()) as { display_name?: string };
  return payload.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
};

const LocationPicker = ({
  selectedPosition,
  onPick,
}: {
  selectedPosition: [number, number] | null;
  onPick: (position: [number, number]) => void;
}) => {
  useMapEvents({
    click(event) {
      onPick([event.latlng.lat, event.latlng.lng]);
    },
  });

  return selectedPosition ? <Marker position={selectedPosition} /> : null;
};

const MapCenterSync = ({ center }: { center: [number, number] }) => {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);

  return null;
};

const parseDuration = (hours: string, minutes: string) => {
  const normalizedHours = Number.parseInt(hours || "0", 10);
  const normalizedMinutes = Number.parseInt(minutes || "0", 10);

  if (Number.isNaN(normalizedHours) || Number.isNaN(normalizedMinutes)) {
    return 0;
  }

  return normalizedHours * 60 + normalizedMinutes;
};

const CreateTask = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [location, setLocation] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState("0");
  const [mapCenter, setMapCenter] = useState<[number, number]>([55.751244, 37.618423]);
  const [selectedPosition, setSelectedPosition] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMapCenter([position.coords.latitude, position.coords.longitude]);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, []);

  const handleMapPick = async (position: [number, number]) => {
    setSelectedPosition(position);
    setMapCenter(position);
    setResolvingAddress(true);

    try {
      const address = await reverseGeocode(position[0], position[1]);
      setLocation(address);
      toast.success("Точка на карте выбрана");
    } catch (error) {
      setLocation(`${position[0].toFixed(5)}, ${position[1].toFixed(5)}`);
      toast.error(error instanceof Error ? error.message : "Не удалось определить адрес");
    } finally {
      setResolvingAddress(false);
    }
  };

  const handleDetectMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Браузер не поддерживает геолокацию");
      return;
    }

    setDetectingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextPosition: [number, number] = [position.coords.latitude, position.coords.longitude];
        await handleMapPick(nextPosition);
        setDetectingLocation(false);
      },
      () => {
        toast.error("Не удалось определить ваше местоположение");
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    const totalDurationMinutes = parseDuration(durationHours, durationMinutes);
    if (totalDurationMinutes <= 0) {
      toast.error("Укажите длительность задачи больше нуля");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("tasks").insert({
      requester_id: user.id,
      title,
      description: description || null,
      category,
      latitude: selectedPosition?.[0] ?? null,
      location: location || null,
      longitude: selectedPosition?.[1] ?? null,
      preferred_date: preferredDate || null,
      preferred_time: preferredTime || null,
      duration_minutes: totalDurationMinutes,
    });

    if (error) {
      toast.error("Ошибка создания задачи");
    } else {
      toast.success("Задача создана");
      navigate("/my-tasks");
    }

    setLoading(false);
  };

  const totalDurationMinutes = parseDuration(durationHours, durationMinutes);

  return (
    <div className="relative min-h-screen pb-28 sf-theme">
      <SoftPinkBackground density={6} seed={22} />

      <div className="relative z-10">
        <div className="text-center py-6">
          <Logo size="md" />
        </div>

        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4"
        >
          <div className="section-card">
            <div className="mb-2 text-center text-sm font-semibold text-slate-800">
              Что нужно сделать?
            </div>
            <input
              className="field-input"
              placeholder="Например: Купить продукты"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              style={{ fontSize: 15 }}
            />
            <textarea
              className="field-input mt-3"
              placeholder="Подробности задачи"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              style={{ resize: "none" }}
            />
          </div>

          <div className="section-card">
            <div className="mb-3 text-center text-sm font-semibold text-slate-800">Категория</div>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`cat-pill ${category === item.value ? "active" : ""}`}
                  onClick={() => setCategory(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="section-card">
            <div className="mb-2 text-center text-sm font-semibold text-slate-800">Адрес</div>
            <div style={{ position: "relative" }}>
              <input
                className="field-input"
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Укажите адрес"
                style={{ paddingRight: 40 }}
              />
              <img
                src={locationPin}
                alt="pin"
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 22 }}
              />
            </div>
            <button
              type="button"
              className="btn-outline mt-3 w-full"
              onClick={handleDetectMyLocation}
              disabled={detectingLocation || resolvingAddress}
            >
              {detectingLocation ? "Определяем местоположение..." : "📍 Определить мое местоположение"}
            </button>
          </div>

          <div className="section-card">
            <div className="mb-3 text-center text-sm font-semibold text-slate-800">Точка на карте</div>
            <div className="overflow-hidden rounded-xl border border-[#c8d4f0]">
              <div className="h-[220px]">
                <MapContainer center={mapCenter} zoom={11} className="h-full w-full">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapCenterSync center={mapCenter} />
                  <LocationPicker selectedPosition={selectedPosition} onPick={handleMapPick} />
                </MapContainer>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              {resolvingAddress
                ? "Определяем адрес..."
                : selectedPosition
                  ? `Координаты: ${selectedPosition[0].toFixed(4)}, ${selectedPosition[1].toFixed(4)}`
                  : "Нажмите на карту, чтобы выбрать точку"}
            </p>
          </div>

          <div className="section-card" style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#555" }}>Дата</div>
              <input
                className="field-input"
                type="date"
                value={preferredDate}
                onChange={(event) => setPreferredDate(event.target.value)}
                style={{ textAlign: "center" }}
              />
            </div>
            <div style={{ width: 1, background: "#c8d4f0", margin: "0 6px" }} />
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#555" }}>Время</div>
              <input
                className="field-input"
                type="time"
                value={preferredTime}
                onChange={(event) => setPreferredTime(event.target.value)}
                style={{ textAlign: "center" }}
              />
            </div>
          </div>

          <div className="section-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Длительность</p>
                <p className="text-xs text-slate-500">На это время волонтер будет занят</p>
              </div>
              <div className="rounded-full bg-[#FDE8EA] px-3 py-1 text-sm font-semibold text-[#1B2CC1]">
                {formatTaskDuration(totalDurationMinutes)}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Часы
                </div>
                <input
                  className="field-input"
                  type="number"
                  min="0"
                  max="23"
                  value={durationHours}
                  onChange={(event) => setDurationHours(event.target.value)}
                  style={{ textAlign: "center" }}
                />
              </div>
              <div>
                <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Минуты
                </div>
                <input
                  className="field-input"
                  type="number"
                  min="0"
                  max="59"
                  step="5"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  style={{ textAlign: "center" }}
                />
              </div>
            </div>
          </div>

          <button type="submit" className="btn-red" style={{ fontSize: 18 }}>
            {loading ? "Создание..." : "Done"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateTask;
