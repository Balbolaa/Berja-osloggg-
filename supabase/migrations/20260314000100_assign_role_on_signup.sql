CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  selected_role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  IF (NEW.raw_user_meta_data->>'selected_role') IN ('requester', 'volunteer', 'moderator') THEN
    selected_role := (NEW.raw_user_meta_data->>'selected_role')::public.app_role;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, selected_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

INSERT INTO public.user_roles (user_id, role)
SELECT
  users.id,
  (users.raw_user_meta_data->>'selected_role')::public.app_role
FROM auth.users AS users
LEFT JOIN public.user_roles AS roles
  ON roles.user_id = users.id
  AND roles.role = (users.raw_user_meta_data->>'selected_role')::public.app_role
WHERE roles.id IS NULL
  AND (users.raw_user_meta_data->>'selected_role') IN ('requester', 'volunteer', 'moderator');
