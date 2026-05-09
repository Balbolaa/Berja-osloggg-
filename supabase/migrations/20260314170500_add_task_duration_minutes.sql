ALTER TABLE public.tasks
ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_duration_minutes_check
CHECK (duration_minutes > 0 AND duration_minutes <= 1440);
