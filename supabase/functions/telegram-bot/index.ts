import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2';

type TaskRow = {
  id: string;
  title: string;
  category: string;
  location: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  duration_minutes: number;
  latitude: number | null;
  longitude: number | null;
  requester_id: string;
};

type SubscriptionRow = {
  user_id: string;
  chat_id: number | null;
  chat_username: string | null;
  connect_token: string;
  home_latitude: number | null;
  home_longitude: number | null;
  volunteer_radius_meters: number;
  volunteer_nearby_task_notifications: boolean;
  requester_new_application_notifications: boolean;
};

const supabaseUrl = Deno.env.get('PROJECT_SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('PROJECT_SERVICE_ROLE_KEY') ?? '';
const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const siteUrl = (Deno.env.get('SITE_URL') ?? 'http://localhost:4173').replace(/\/$/, '');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const telegramApiBase = `https://api.telegram.org/bot${telegramBotToken}`;

const haversineDistanceMeters = (
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
) => {
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

const formatTaskDuration = (durationMinutes: number) => {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours && minutes) return `${hours} ч ${minutes} мин`;
  if (hours) return `${hours} ч`;
  return `${minutes} мин`;
};

const formatTaskDateTime = (task: TaskRow) => {
  const parts = [task.preferred_date, task.preferred_time].filter(Boolean);
  return parts.length ? parts.join(' ') : 'В ближайшее время';
};

const buildTaskUrl = (taskId: string) => `${siteUrl}/task/${taskId}`;

const sendTelegramMessage = async (
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
) => {
  const response = await fetch(`${telegramApiBase}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...extra,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${errorText}`);
  }
};

const sendVolunteerTaskAlert = async (chatId: number, task: TaskRow, distanceMeters: number) => {
  const message = [
    'Новая задача рядом с вами',
    '',
    `Задача: ${task.title}`,
    `Категория: ${task.category}`,
    `Когда: ${formatTaskDateTime(task)}`,
    `Длительность: ${formatTaskDuration(task.duration_minutes)}`,
    `Адрес: ${task.location ?? 'Адрес не указан'}`,
    `Расстояние: ${Math.round(distanceMeters)} м`,
    '',
    `Открыть: ${buildTaskUrl(task.id)}`,
  ].join('\n');

  await sendTelegramMessage(chatId, message);
};

const sendRequesterApplicationAlert = async (
  chatId: number,
  task: TaskRow,
  volunteerName: string,
) => {
  const message = [
    'Новый отклик на вашу задачу',
    '',
    `Задача: ${task.title}`,
    `Волонтёр: ${volunteerName}`,
    '',
    `Открыть: ${buildTaskUrl(task.id)}`,
  ].join('\n');

  await sendTelegramMessage(chatId, message);
};

const handleTaskCreatedEvent = async (taskId: string) => {
  const { data: task } = await supabase
    .from('tasks')
    .select('id, title, category, location, preferred_date, preferred_time, duration_minutes, latitude, longitude, requester_id')
    .eq('id', taskId)
    .maybeSingle<TaskRow>();

  if (!task || task.latitude === null || task.longitude === null) return;

  const { data: volunteerRoles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'volunteer');

  const volunteerIds = (volunteerRoles ?? []).map((row) => row.user_id);
  if (!volunteerIds.length) return;

  const { data: subscriptions } = await supabase
    .from('telegram_subscriptions')
    .select('user_id, chat_id, chat_username, connect_token, home_latitude, home_longitude, volunteer_radius_meters, volunteer_nearby_task_notifications, requester_new_application_notifications')
    .in('user_id', volunteerIds)
    .eq('volunteer_nearby_task_notifications', true)
    .not('chat_id', 'is', null) as { data: SubscriptionRow[] | null };

  for (const subscription of subscriptions ?? []) {
    if (
      subscription.chat_id === null ||
      subscription.home_latitude === null ||
      subscription.home_longitude === null
    ) {
      continue;
    }

    const distanceMeters = haversineDistanceMeters(
      { lat: subscription.home_latitude, lng: subscription.home_longitude },
      { lat: task.latitude, lng: task.longitude },
    );

    if (distanceMeters > subscription.volunteer_radius_meters) continue;

    await sendVolunteerTaskAlert(subscription.chat_id, task, distanceMeters);
  }
};

const handleApplicationCreatedEvent = async (applicationId: string) => {
  const { data: application } = await supabase
    .from('task_applications')
    .select('task_id, volunteer_id')
    .eq('id', applicationId)
    .maybeSingle<{ task_id: string; volunteer_id: string }>();

  if (!application) return;

  const [{ data: task }, { data: volunteerProfile }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, category, location, preferred_date, preferred_time, duration_minutes, latitude, longitude, requester_id')
      .eq('id', application.task_id)
      .maybeSingle<TaskRow>(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', application.volunteer_id)
      .maybeSingle<{ full_name: string | null }>(),
  ]);

  if (!task) return;

  const { data: requesterSubscription } = await supabase
    .from('telegram_subscriptions')
    .select('user_id, chat_id, chat_username, connect_token, home_latitude, home_longitude, volunteer_radius_meters, volunteer_nearby_task_notifications, requester_new_application_notifications')
    .eq('user_id', task.requester_id)
    .eq('requester_new_application_notifications', true)
    .maybeSingle<SubscriptionRow>();

  if (!requesterSubscription?.chat_id) return;

  await sendRequesterApplicationAlert(
    requesterSubscription.chat_id,
    task,
    volunteerProfile?.full_name || 'Новый волонтёр',
  );
};

const handleTelegramStart = async (chatId: number, username: string | undefined, token: string | undefined) => {
  if (!token) {
    await sendTelegramMessage(
      chatId,
      'Откройте бота по персональной ссылке из профиля, чтобы подключить уведомления.',
    );
    return;
  }

  const { data: subscription } = await supabase
    .from('telegram_subscriptions')
    .select('user_id, connect_token')
    .eq('connect_token', token)
    .maybeSingle<{ user_id: string; connect_token: string }>();

  if (!subscription) {
    await sendTelegramMessage(chatId, 'Ссылка устарела или недействительна. Откройте новую ссылку из профиля.');
    return;
  }

  await supabase
    .from('telegram_subscriptions')
    .update({
      chat_id: chatId,
      chat_username: username ?? null,
      bot_started_at: new Date().toISOString(),
      connect_token: crypto.randomUUID(),
    })
    .eq('user_id', subscription.user_id);

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', subscription.user_id);

  const roles = (roleRows ?? []).map((row) => row.role);
  const isVolunteer = roles.includes('volunteer');

  await sendTelegramMessage(
    chatId,
    isVolunteer
      ? 'Бот подключён. Теперь отправьте мне геолокацию, и я буду присылать новые задачи в радиусе 1 км.'
      : 'Бот подключён. Теперь я буду присылать новые отклики на ваши задачи.',
    isVolunteer
      ? {
          reply_markup: {
            keyboard: [[{ text: 'Отправить геолокацию', request_location: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      : {},
  );
};

const handleTelegramLocation = async (chatId: number, latitude: number, longitude: number) => {
  const { error } = await supabase
    .from('telegram_subscriptions')
    .update({
      home_latitude: latitude,
      home_longitude: longitude,
    })
    .eq('chat_id', chatId);

  if (error) {
    await sendTelegramMessage(chatId, 'Не удалось сохранить геолокацию. Попробуйте ещё раз.');
    return;
  }

  await sendTelegramMessage(chatId, 'Геолокация сохранена. Буду присылать nearby-задачи в радиусе 1 км.');
};

const handleTelegramStop = async (chatId: number) => {
  await supabase
    .from('telegram_subscriptions')
    .update({
      chat_id: null,
      chat_username: null,
      bot_started_at: null,
    })
    .eq('chat_id', chatId);

  await sendTelegramMessage(chatId, 'Уведомления отключены. Можете подключить бота снова из профиля.');
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Only POST is supported', { status: 405 });
  }

  if (!supabaseUrl || !serviceRoleKey || !telegramBotToken) {
    return new Response('Missing required environment variables', { status: 500 });
  }

  const body = await req.json();

  if (body?.event === 'task_created' && typeof body.task_id === 'string') {
    await handleTaskCreatedEvent(body.task_id);
    return Response.json({ ok: true });
  }

  if (body?.event === 'application_created' && typeof body.application_id === 'string') {
    await handleApplicationCreatedEvent(body.application_id);
    return Response.json({ ok: true });
  }

  const message = body?.message;
  if (!message?.chat?.id) {
    return Response.json({ ok: true });
  }

  const chatId = Number(message.chat.id);
  const text = typeof message.text === 'string' ? message.text.trim() : '';

  if (text.startsWith('/start')) {
    const token = text.split(/\s+/)[1];
    await handleTelegramStart(chatId, message.from?.username, token);
    return Response.json({ ok: true });
  }

  if (text.startsWith('/stop')) {
    await handleTelegramStop(chatId);
    return Response.json({ ok: true });
  }

  if (
    typeof message.location?.latitude === 'number' &&
    typeof message.location?.longitude === 'number'
  ) {
    await handleTelegramLocation(chatId, message.location.latitude, message.location.longitude);
    return Response.json({ ok: true });
  }

  await sendTelegramMessage(
    chatId,
    'Команды: /start по ссылке из профиля, /stop для отключения. Волонтёрам после подключения нужно отправить геолокацию.',
  );

  return Response.json({ ok: true });
});
