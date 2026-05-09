import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchApprovedVerificationUserIds } from '@/integrations/supabase/verificationLookup';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import VerifiedAvatar from '@/components/VerifiedAvatar';
import SoftPinkBackground from '@/components/service-finder/SoftPinkBackground';
import Logo from '@/components/service-finder/Logo';
import { findActiveTask, findOverlappingTask, formatTaskDuration } from '@/lib/taskScheduling';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

const STATUS_LABELS: Record<string, string> = {
  open: '🟢 Открыта',
  assigned: '🔵 Назначена',
  in_progress: '🟡 В работе',
  completed: '✅ Завершена',
  cancelled: '❌ Отменена',
};

const MAX_REPORT_PHOTO_BYTES = 6 * 1024 * 1024;
const MAX_REPORT_PHOTOS = 3;

type ReviewPreview = Pick<Tables<'reviews'>, 'id' | 'rating' | 'comment' | 'created_at'>;
type EnrichedApplication = Tables<'task_applications'> & {
  profile?: Tables<'profiles'>;
  averageRating: number | null;
  reviewCount: number;
  reviews: ReviewPreview[];
  isVerified: boolean;
};
type EnrichedMessage = Tables<'messages'> & { profile?: Tables<'profiles'> };
type ReportPhoto = { name: string; url: string };
type ReportPayload = { taskId: string; taskTitle: string; explanation: string; photos: ReportPhoto[] };

const getInitials = (fullName?: string | null) =>
  fullName?.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'В';

const formatReviewDate = (value: string) =>
  new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

const renderStars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

export const parseReportDetails = (details?: string | null): ReportPayload | null => {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Partial<ReportPayload>;
    if (typeof parsed.explanation !== 'string') return null;
    return {
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId : '',
      taskTitle: typeof parsed.taskTitle === 'string' ? parsed.taskTitle : '',
      explanation: parsed.explanation,
      photos: Array.isArray(parsed.photos)
        ? parsed.photos.filter(
            (item): item is ReportPhoto =>
              Boolean(item) && typeof item === 'object' && typeof item.name === 'string' && typeof item.url === 'string',
          )
        : [],
    };
  } catch {
    return null;
  }
};

const ReviewSummary = ({
  averageRating,
  reviewCount,
  reviews,
}: {
  averageRating: number | null;
  reviewCount: number;
  reviews: ReviewPreview[];
}) => {
  if (!reviewCount || averageRating === null) {
    return <p className="text-sm font-medium text-muted-foreground">Пока нет отзывов</p>;
  }

  return (
    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <span>{`⭐ ${averageRating.toFixed(1)}`}</span>
      <Dialog>
        <DialogTrigger asChild>
          <button type="button" className="underline-offset-4 hover:underline">
            {reviewCount} отзывов
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Отзывы о волонтёре</DialogTitle>
            <DialogDescription>Комментарии заказчиков по завершённым задачам.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] space-y-3 overflow-y-auto">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-bold text-primary">{renderStars(review.rating)}</p>
                  <p className="text-sm text-muted-foreground">{formatReviewDate(review.created_at)}</p>
                </div>
                <p className="mt-3 text-body">{review.comment || 'Комментарий не был добавлен.'}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const LabelLike = ({ children }: { children: string }) => (
  <p className="text-sm font-semibold text-muted-foreground">{children}</p>
);

const fetchVolunteerBusyTask = async (volunteerId: string, excludeTaskId?: string) => {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_volunteer_id', volunteerId)
    .in('status', ['assigned', 'in_progress']);

  const filteredTasks = (data ?? []).filter((item) => item.id !== excludeTaskId);
  return findActiveTask(filteredTasks);
};

const fetchVolunteerAcceptedTask = async (
  volunteerId: string,
  candidateTask: Tables<'tasks'>,
  excludeTaskId?: string,
) => fetchVolunteerOverlappingTask(volunteerId, candidateTask, excludeTaskId);

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

const TaskDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [task, setTask] = useState<Tables<'tasks'> | null>(null);
  const [applications, setApplications] = useState<EnrichedApplication[]>([]);
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hasSubmittedReview, setHasSubmittedReview] = useState(false);
  const [assignedVolunteerProfile, setAssignedVolunteerProfile] = useState<Tables<'profiles'> | null>(null);
  const [requesterProfile, setRequesterProfile] = useState<Tables<'profiles'> | null>(null);
  const [requesterVerified, setRequesterVerified] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [activeAssignedTask, setActiveAssignedTask] = useState<Tables<'tasks'> | null>(null);
  const [acceptedTaskElsewhere, setAcceptedTaskElsewhere] = useState<Tables<'tasks'> | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportPhotos, setReportPhotos] = useState<ReportPhoto[]>([]);
  const [submittingReport, setSubmittingReport] = useState(false);

  const isOwner = task?.requester_id === user?.id;
  const isAssigned = task?.assigned_volunteer_id === user?.id;
  const canApply = Boolean(user && task && !isOwner && !isAssigned && task.status === 'open' && !hasApplied && !activeAssignedTask);
  const canSeeRequesterPhone = Boolean(isOwner || isAssigned);
  const canReportAssignedTask = Boolean(task && task.status === 'assigned' && (isOwner || isAssigned));

  const reportedUserId = useMemo(() => {
    if (!task || !user) return null;
    if (isOwner) return task.assigned_volunteer_id;
    if (isAssigned) return task.requester_id;
    return null;
  }, [isAssigned, isOwner, task, user]);

  useEffect(() => {
    if (!id || !user) return;

    const fetchData = async () => {
      setLoading(true);
      const { data: taskData } = await supabase.from('tasks').select('*').eq('id', id).single();
      setTask(taskData);

      if (taskData?.requester_id) {
        const [ownerProfileResult, approvedSet] = await Promise.all([
          supabase.from('profiles').select('*').eq('user_id', taskData.requester_id).single(),
          fetchApprovedVerificationUserIds([taskData.requester_id]),
        ]);
        setRequesterProfile(ownerProfileResult.data ?? null);
        setRequesterVerified(approvedSet.has(taskData.requester_id));
      } else {
        setRequesterProfile(null);
        setRequesterVerified(false);
      }

      if (taskData?.assigned_volunteer_id) {
        const { data: assignedProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', taskData.assigned_volunteer_id)
          .single();
        setAssignedVolunteerProfile(assignedProfile ?? null);
      } else {
        setAssignedVolunteerProfile(null);
      }

      if (taskData && taskData.requester_id === user.id) {
        const { data: apps } = await supabase.from('task_applications').select('*').eq('task_id', id).order('created_at', { ascending: false });
        if (apps?.length) {
          const volunteerIds = apps.map((application) => application.volunteer_id);
          const [profilesResult, reviewsResult, approvedSet] = await Promise.all([
            supabase.from('profiles').select('*').in('user_id', volunteerIds),
            supabase.from('reviews').select('id, reviewed_user_id, rating, comment, created_at').in('reviewed_user_id', volunteerIds).order('created_at', { ascending: false }),
            fetchApprovedVerificationUserIds(volunteerIds),
          ]);
          const profiles = profilesResult.data ?? [];
          const reviews = reviewsResult.data ?? [];
          const reviewsByVolunteer = new Map<string, ReviewPreview[]>();
          for (const review of reviews) {
            const current = reviewsByVolunteer.get(review.reviewed_user_id) ?? [];
            current.push(review);
            reviewsByVolunteer.set(review.reviewed_user_id, current);
          }
          setApplications(apps.map((application) => {
            const volunteerReviews = reviewsByVolunteer.get(application.volunteer_id) ?? [];
            const reviewCount = volunteerReviews.length;
            const averageRating = reviewCount ? volunteerReviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount : null;
            return {
              ...application,
              profile: profiles.find((profile) => profile.user_id === application.volunteer_id),
              averageRating,
              reviewCount,
              reviews: volunteerReviews,
              isVerified: approvedSet.has(application.volunteer_id),
            };
          }));
        } else {
          setApplications([]);
        }

        const { data: existingReview } = await supabase.from('reviews').select('id').eq('task_id', id).eq('reviewer_id', user.id).maybeSingle();
        setHasSubmittedReview(Boolean(existingReview));
      }

      if (taskData && taskData.requester_id !== user.id) {
        const { data: existingApplication } = await supabase.from('task_applications').select('id').eq('task_id', id).eq('volunteer_id', user.id).maybeSingle();
        setHasApplied(Boolean(existingApplication));
        setActiveAssignedTask(await fetchVolunteerBusyTask(user.id, taskData.id));
        setAcceptedTaskElsewhere(await fetchVolunteerAcceptedTask(user.id, taskData, taskData.id));
      } else {
        setActiveAssignedTask(null);
        setAcceptedTaskElsewhere(null);
      }

      if (taskData && (taskData.requester_id === user.id || taskData.assigned_volunteer_id === user.id)) {
        const { data: msgs } = await supabase.from('messages').select('*').eq('task_id', id).order('created_at', { ascending: true });
        if (msgs?.length) {
          const senderIds = [...new Set(msgs.map((message) => message.sender_id))];
          const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', senderIds);
          setMessages(msgs.map((message) => ({
            ...message,
            profile: profiles?.find((profile) => profile.user_id === message.sender_id),
          })));
        } else {
          setMessages([]);
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [id, user]);

  const acceptApplication = async (appId: string, volunteerId: string) => {
    if (!id || !task) return;
    const busyTask = await fetchVolunteerBusyTask(volunteerId, id);
    if (busyTask) {
      toast.error('Этот волонтёр уже занят другой принятой задачей в текущее время');
      return;
    }
    const overlappingTask = await fetchVolunteerOverlappingTask(volunteerId, task, id);
    if (overlappingTask) {
      toast.error('У волонтёра уже есть другая принятая задача с пересекающимся временем');
      return;
    }
    await supabase.from('task_applications').update({ status: 'accepted' }).eq('id', appId);
    await supabase
      .from('task_applications')
      .delete()
      .eq('volunteer_id', volunteerId)
      .eq('status', 'pending')
      .neq('id', appId);
    await supabase.from('tasks').update({ assigned_volunteer_id: volunteerId, status: 'assigned' }).eq('id', id);
    toast.success('Волонтёр назначен');
    window.location.reload();
  };

  const handleApply = async () => {
    if (!id || !user || !task) return;
    if (activeAssignedTask) {
      toast.error('Вы заняты принятой задачей и не можете отправлять новые отклики до её окончания');
      return;
    }
    const overlappingTask = await fetchVolunteerOverlappingTask(user.id, task, id);
    if (overlappingTask) {
      toast.error('У вас уже есть принятая задача с пересекающимся временем');
      return;
    }
    setApplying(true);
    const { error } = await supabase.from('task_applications').insert({
      task_id: id,
      volunteer_id: user.id,
      message: 'Я готов(а) помочь!',
    });
    if (error) {
      if (error.code === '23505') {
        toast.error('Вы уже откликнулись на эту задачу');
        setHasApplied(true);
      } else {
        toast.error('Ошибка при отклике');
      }
    } else {
      toast.success('Отклик отправлен');
      setHasApplied(true);
    }
    setApplying(false);
  };

  const updateStatus = async (status: Tables<'tasks'>['status']) => {
    if (!id) return;
    await supabase.from('tasks').update({ status }).eq('id', id);
    toast.success('Статус обновлён');
    window.location.reload();
  };

  const openCompleteReviewDialog = () => {
    if (!task?.assigned_volunteer_id) {
      toast.error('Сначала назначьте исполнителя');
      return;
    }
    if (hasSubmittedReview) {
      updateStatus('completed');
      return;
    }
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !user || !task?.assigned_volunteer_id) return;
    if (!reviewComment.trim()) {
      toast.error('Добавьте комментарий к отзыву');
      return;
    }
    setSubmittingReview(true);
    const { error: statusError } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', id);
    if (statusError) {
      toast.error(`Не удалось завершить задачу: ${statusError.message}`);
      setSubmittingReview(false);
      return;
    }
    const { error: reviewError } = await supabase.from('reviews').insert({
      task_id: id,
      reviewer_id: user.id,
      reviewed_user_id: task.assigned_volunteer_id,
      rating: reviewRating,
      comment: reviewComment.trim(),
    });
    if (reviewError) {
      toast.error(`Задача завершена, но отзыв не сохранился: ${reviewError.message}`);
      setSubmittingReview(false);
      window.location.reload();
      return;
    }
    toast.success('Задача завершена, отзыв сохранён');
    setReviewDialogOpen(false);
    setHasSubmittedReview(true);
    window.location.reload();
  };

  const handleReportPhotosChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const freeSlots = MAX_REPORT_PHOTOS - reportPhotos.length;
    if (freeSlots <= 0) {
      toast.error(`Можно приложить до ${MAX_REPORT_PHOTOS} фото`);
      event.target.value = '';
      return;
    }
    const nextFiles = files.slice(0, freeSlots);
    try {
      const nextPhotos = await Promise.all(nextFiles.map(async (file) => {
        if (!file.type.startsWith('image/')) {
          throw new Error('Можно загружать только фотографии');
        }
        if (file.size > MAX_REPORT_PHOTO_BYTES) {
          throw new Error('Одно из фото слишком большое. Используйте файл до 6 МБ');
        }
        return { name: file.name, url: await readFileAsDataUrl(file) } satisfies ReportPhoto;
      }));
      setReportPhotos((current) => [...current, ...nextPhotos]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить фото');
    } finally {
      event.target.value = '';
    }
  };

  const removeReportPhoto = (photoUrl: string) => {
    setReportPhotos((current) => current.filter((photo) => photo.url !== photoUrl));
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!task || !user || !reportedUserId) return;
    if (!reportReason.trim()) {
      toast.error('Опишите проблему');
      return;
    }
    setSubmittingReport(true);
    const payload: ReportPayload = {
      taskId: task.id,
      taskTitle: task.title,
      explanation: reportReason.trim(),
      photos: reportPhotos,
    };
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_user_id: reportedUserId,
      reason: 'Проблема в назначенной задаче',
      details: JSON.stringify(payload),
      status: 'pending',
    });
    if (error) {
      toast.error(`Не удалось отправить жалобу: ${error.message}`);
      setSubmittingReport(false);
      return;
    }
    toast.success('Жалоба отправлена модератору');
    setReportDialogOpen(false);
    setReportReason('');
    setReportPhotos([]);
    setSubmittingReport(false);
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !id || !newMessage.trim()) return;
    const { error } = await supabase.from('messages').insert({
      task_id: id,
      sender_id: user.id,
      content: newMessage.trim(),
    });
    if (error) {
      toast.error('Ошибка отправки');
      return;
    }
    setNewMessage('');
    const { data: msgs } = await supabase.from('messages').select('*').eq('task_id', id).order('created_at', { ascending: true });
    if (msgs?.length) {
      const senderIds = [...new Set(msgs.map((message) => message.sender_id))];
      const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', senderIds);
      setMessages(msgs.map((message) => ({
        ...message,
        profile: profiles?.find((profile) => profile.user_id === message.sender_id),
      })));
    } else {
      setMessages([]);
    }
  };

  if (loading) return <p className="p-8 text-center text-body">Загрузка...</p>;
  if (!task) return <p className="p-8 text-center text-body">Задача не найдена</p>;

  return (
    <div className="relative min-h-screen sf-theme">
      <SoftPinkBackground density={6} seed={31} />
      <div className="relative z-10 min-h-screen pb-28">
        <div className="text-center pt-5 pb-4">
          <Logo size="md" />
        </div>
        <div className="animate-fade-in space-y-6 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-heading">{task.title}</CardTitle>
              <Badge variant="secondary" className="shrink-0 text-sm font-bold">
                {STATUS_LABELS[task.status] ?? task.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {task.description && <p className="text-body">{task.description}</p>}
            <div className="flex flex-wrap gap-3">
              <span className="text-body text-muted-foreground">📂 {task.category}</span>
              {task.location && <span className="text-body text-muted-foreground">📍 {task.location}</span>}
              {task.preferred_date && <span className="text-body text-muted-foreground">📅 {task.preferred_date}</span>}
              {task.preferred_time && <span className="text-body text-muted-foreground">🕐 {task.preferred_time}</span>}
              <span className="text-body text-muted-foreground">⏳ {formatTaskDuration(task.duration_minutes)}</span>
            </div>
            {canApply && (
              <Button
                size="lg"
                disabled={applying}
                onClick={handleApply}
                className="min-h-tap w-full sm:w-auto font-bold bg-[#1B2CC1] text-white hover:bg-[#152099]"
              >
                {applying ? 'Отправка...' : '🤝 Помочь'}
              </Button>
            )}
            {!isOwner && !isAssigned && acceptedTaskElsewhere && (
              <p className="text-sm font-medium text-primary">Вы уже приняты на другую задачу</p>
            )}
            {!isOwner && !isAssigned && !acceptedTaskElsewhere && hasApplied && task.status === 'open' && (
              <p className="text-sm font-medium text-primary">Вы уже откликнулись на эту задачу</p>
            )}
            {isOwner && task.status === 'assigned' && (
              <div className="flex flex-wrap gap-3 pt-2">
                <Button size="lg" className="min-h-tap font-bold" onClick={openCompleteReviewDialog}>
                  ✅ Завершить задачу
                </Button>
                <Button size="lg" variant="outline" className="min-h-tap font-bold" onClick={() => updateStatus('cancelled')}>
                  ❌ Отменить
                </Button>
              </div>
            )}
            {isOwner && task.status === 'open' && (
              <Button size="lg" variant="outline" className="min-h-tap font-bold" onClick={() => updateStatus('cancelled')}>
                ❌ Отменить задачу
              </Button>
            )}
            {canReportAssignedTask && (
              <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" variant="destructive" className="min-h-tap font-bold">
                    🚨 Пожаловаться
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Жалоба на участника задачи</DialogTitle>
                    <DialogDescription>
                      Опишите проблему и при необходимости приложите фотографии. Жалоба отправится в общую очередь модераторов.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={submitReport} className="space-y-5">
                    <div className="space-y-2">
                      <LabelLike>Что произошло</LabelLike>
                      <Textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="min-h-[140px] text-body" placeholder="Опишите ситуацию, чтобы модератор понял проблему" />
                    </div>
                    <div className="space-y-2">
                      <LabelLike>Фотографии</LabelLike>
                      <Input type="file" accept="image/*" multiple onChange={handleReportPhotosChange} />
                      <p className="text-sm text-muted-foreground">До {MAX_REPORT_PHOTOS} фото, каждое до 6 МБ.</p>
                    </div>
                    {reportPhotos.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {reportPhotos.map((photo) => (
                          <div key={photo.url} className="space-y-2 rounded-lg border p-2">
                            <img src={photo.url} alt={photo.name} className="h-28 w-full rounded-md object-cover" />
                            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => removeReportPhoto(photo.url)}>
                              Удалить
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)} disabled={submittingReport}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={submittingReport}>
                        {submittingReport ? 'Отправляем...' : 'Submit'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>

        {requesterProfile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-heading-sm">Заказчик</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <VerifiedAvatar src={requesterProfile.avatar_url ?? undefined} alt={requesterProfile.full_name || 'Заказчик'} fallback={getInitials(requesterProfile.full_name)} verified={requesterVerified} className="h-20 w-20 border" fallbackClassName="text-lg font-bold" />
                <div className="space-y-1">
                  <p className="text-lg font-bold">{requesterProfile.full_name || 'Заказчик'}</p>
                  <p className="text-sm text-muted-foreground">
                    {canSeeRequesterPhone ? requesterProfile.phone || 'Телефон не указан' : 'Телефон откроется после принятия вас на задачу'}
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-secondary/60 p-4">
                <p className="text-sm font-semibold text-muted-foreground">О заказчике</p>
                <p className="mt-2 text-body">{requesterProfile.bio || 'Заказчик пока не заполнил описание профиля.'}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {isOwner && applications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-heading-sm">Отклики ({applications.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {applications.map((app) => (
                <div key={app.id} className="flex flex-col gap-4 rounded-lg border bg-secondary/30 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <VerifiedAvatar src={app.profile?.avatar_url ?? undefined} alt={app.profile?.full_name ?? 'Volunteer'} fallback={getInitials(app.profile?.full_name)} verified={app.isVerified} className="h-14 w-14 border" fallbackClassName="font-bold" />
                    <div className="space-y-2">
                      <p className="text-body font-bold">{app.profile?.full_name || 'Волонтёр'}</p>
                      {app.message && <p className="text-body text-muted-foreground">{app.message}</p>}
                      <Badge variant="secondary" className="mt-1">{app.status}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <ReviewSummary averageRating={app.averageRating} reviewCount={app.reviewCount} reviews={app.reviews} />
                    <div className="flex flex-wrap gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="font-bold">О исполнителе</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Карточка исполнителя</DialogTitle>
                            <DialogDescription>Информация из профиля и отзывов волонтёра.</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <VerifiedAvatar src={app.profile?.avatar_url ?? undefined} alt={app.profile?.full_name ?? 'Волонтёр'} fallback={getInitials(app.profile?.full_name)} verified={app.isVerified} className="h-20 w-20 border" fallbackClassName="text-lg font-bold" />
                              <div className="space-y-1">
                                <p className="text-lg font-bold">{app.profile?.full_name || 'Волонтёр'}</p>
                                <p className="text-sm text-muted-foreground">{app.profile?.phone || 'Телефон пока не указан'}</p>
                                <ReviewSummary averageRating={app.averageRating} reviewCount={app.reviewCount} reviews={app.reviews} />
                              </div>
                            </div>
                            <div className="rounded-lg bg-secondary/60 p-4">
                              <p className="text-sm font-semibold text-muted-foreground">О себе</p>
                              <p className="mt-2 text-body">{app.profile?.bio || 'Исполнитель пока не заполнил описание профиля.'}</p>
                            </div>
                            {app.message && (
                              <div className="rounded-lg border p-4">
                                <p className="text-sm font-semibold text-muted-foreground">Сообщение к отклику</p>
                                <p className="mt-2 text-body">{app.message}</p>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                      {app.status === 'pending' && task.status === 'open' && (
                        <Button size="lg" className="min-h-tap bg-blue-600 font-bold text-white hover:bg-blue-700" onClick={() => acceptApplication(app.id, app.volunteer_id)}>
                          Принять
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {(isOwner || isAssigned) && task.assigned_volunteer_id && (
          <div className="mx-auto w-full max-w-5xl">
            <div style={{ border: "2px solid #1B2CC1", borderRadius: 10, background: "#fff" }}>
              <div style={{ borderBottom: "1px solid #1B2CC1", padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "#1B2CC1" }}>
                Private Chat
              </div>
              <div style={{ minHeight: 380, maxHeight: 520, overflowY: "auto", padding: 18 }}>
                {messages.length === 0 && <p className="py-4 text-center text-body text-muted-foreground">Нет сообщений</p>}
                {messages.map((message) => {
                  const isMe = message.sender_id === user?.id;
                  return (
                    <div key={message.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 14 }}>
                      {!isMe && (
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#c8b0b0", marginRight: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff" }}>
                          {(message.profile?.full_name || "U")[0]}
                        </div>
                      )}
                      <div style={{ maxWidth: "60%" }}>
                        {!isMe && (
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                            {message.profile?.full_name || "Пользователь"}
                          </div>
                        )}
                        <div
                          style={{
                            background: isMe ? "#FDE8EA" : "#fff",
                            border: "1px solid #ddd",
                            borderRadius: 12,
                            padding: "8px 12px",
                          }}
                        >
                          <div style={{ fontSize: 14 }}>{message.content}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 4, textAlign: isMe ? "right" : "left" }}>
                          {new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      {isMe && (
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#1B2CC1", marginLeft: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="1.5">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <form onSubmit={sendMessage} className="mt-4 flex items-center gap-3">
              <input
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                placeholder="Type a message..."
                className="field-input flex-1 text-base"
                style={{ paddingTop: 16, paddingBottom: 16, minHeight: 60, borderColor: "#E03A1E" }}
              />
              <button type="submit" style={{ padding: "14px 26px", background: "#1B2CC1", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700 }}>
                Send
              </button>
            </form>
          </div>
        )}
        </div>
      </div>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="border-[#1B2CC1]/20 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Отзыв о волонтёре</DialogTitle>
            <DialogDescription>После завершения задачи заказчик оставляет оценку и комментарий исполнителю.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitReview} className="space-y-5">
            <div className="rounded-lg bg-[#FDE8EA]/60 p-4">
              <p className="font-bold text-body">{assignedVolunteerProfile?.full_name || 'Волонтёр'}</p>
              <p className="text-sm text-muted-foreground">Поставьте оценку от 1 до 5 звёзд и напишите комментарий.</p>
            </div>
            <div className="space-y-2">
              <LabelLike>Оценка</LabelLike>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => setReviewRating(star)} className={`rounded-lg border px-4 py-2 text-xl transition ${star <= reviewRating ? 'border-[#1B2CC1] bg-[#1B2CC1]/10 text-[#1B2CC1]' : 'border-border bg-background text-muted-foreground'}`}>
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <LabelLike>Комментарий</LabelLike>
              <Textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} className="min-h-[120px] text-body" placeholder="Напишите, как волонтёр справился с задачей" />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="border-[#1B2CC1]/30 text-[#1B2CC1] hover:bg-[#FDE8EA] hover:text-[#1B2CC1]" onClick={() => setReviewDialogOpen(false)} disabled={submittingReview}>Отмена</Button>
              <Button type="submit" className="bg-[#1B2CC1] text-white hover:bg-[#152099]" disabled={submittingReview}>{submittingReview ? 'Сохраняем...' : 'Завершить и оставить отзыв'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskDetail;
