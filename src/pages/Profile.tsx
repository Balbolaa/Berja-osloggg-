import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import VerifiedAvatar from '@/components/VerifiedAvatar';
import Logo from '@/components/service-finder/Logo';
import SoftPinkBackground from '@/components/service-finder/SoftPinkBackground';
import { StarBackground } from '@/components/service-finder/AuthCircles';
import StarRating from '@/components/service-finder/StarRating';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

const MAX_SOURCE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_SAVED_DATA_URL_LENGTH = 600_000;
const CROP_FRAME_SIZE = 280;
const OUTPUT_AVATAR_SIZE = 512;
const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52];

type CropImage = {
  src: string;
  width: number;
  height: number;
};

type CropOffset = {
  x: number;
  y: number;
};

type ReviewItem = Tables<'reviews'>;
type VerificationItem = Tables<'verifications'> | null;
type TelegramSubscriptionItem = Tables<'telegram_subscriptions'> | null;

const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.replace('@', '') ?? '';

const getInitials = (fullName: string) =>
  fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'П';

const formatReviewDate = (value: string) =>
  new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const renderStars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось открыть изображение'));
    image.src = src;
  });

const getRenderedSize = (image: CropImage, zoom: number) => {
  const baseScale = Math.max(CROP_FRAME_SIZE / image.width, CROP_FRAME_SIZE / image.height);
  return {
    width: image.width * baseScale * zoom,
    height: image.height * baseScale * zoom,
  };
};

const clampOffset = (image: CropImage, zoom: number, offset: CropOffset) => {
  const rendered = getRenderedSize(image, zoom);
  const minX = Math.min(0, CROP_FRAME_SIZE - rendered.width);
  const minY = Math.min(0, CROP_FRAME_SIZE - rendered.height);

  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
};

const getCenteredOffset = (image: CropImage, zoom: number) => {
  const rendered = getRenderedSize(image, zoom);
  return clampOffset(image, zoom, {
    x: (CROP_FRAME_SIZE - rendered.width) / 2,
    y: (CROP_FRAME_SIZE - rendered.height) / 2,
  });
};

const compressImageToDataUrl = async (file: File, maxDimension: number, quality: number) => {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось подготовить изображение');

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
};

const Profile = () => {
  const { user, roles, signOut } = useAuth();
  const verificationInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [reviewsDialogOpen, setReviewsDialogOpen] = useState(false);
  const [cropImage, setCropImage] = useState<CropImage | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [verification, setVerification] = useState<VerificationItem>(null);
  const [telegramSubscription, setTelegramSubscription] = useState<TelegramSubscriptionItem>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const isVerified = verification?.status === 'approved';
  const isRequesterOnly = roles.includes('requester') && !roles.includes('volunteer') && !roles.includes('moderator');

  useEffect(() => {
    if (!user) return;

    const fetchProfileData = async () => {
      const [{ data: profile }, { data: verificationRow }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).single(),
        supabase
          .from('verifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const { data: subscriptionRow } = await supabase
        .from('telegram_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name);
        setPhone(profile.phone ?? '');
        setBio(profile.bio ?? '');
        setAvatarUrl(profile.avatar_url ?? '');
      }

      setVerification(verificationRow ?? null);
      if (subscriptionRow) {
        setTelegramSubscription(subscriptionRow);
      } else {
        const { data: createdSubscription } = await supabase
          .from('telegram_subscriptions')
          .insert({ user_id: user.id })
          .select('*')
          .single();

        setTelegramSubscription(createdSubscription ?? null);
      }

      if (roles.includes('volunteer')) {
        const { data: reviewRows } = await supabase
          .from('reviews')
          .select('*')
          .eq('reviewed_user_id', user.id)
          .order('created_at', { ascending: false });

        const nextReviews = reviewRows ?? [];
        setReviews(nextReviews);
        setAverageRating(
          nextReviews.length
            ? nextReviews.reduce((sum, review) => sum + review.rating, 0) / nextReviews.length
            : null,
        );
      }

      setLoading(false);
    };

    fetchProfileData();
  }, [roles, user]);

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Пожалуйста, выберите изображение');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_SOURCE_FILE_BYTES) {
      toast.error('Фото слишком большое. Выберите файл до 12 МБ.');
      event.target.value = '';
      return;
    }

    try {
      const source = await readFileAsDataUrl(file);
      const image = await loadImage(source);
      const nextCropImage = {
        src: source,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      };

      setCropImage(nextCropImage);
      setCropZoom(1);
      setCropOffset(getCenteredOffset(nextCropImage, 1));
      setCropDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось подготовить фото');
    } finally {
      event.target.value = '';
    }
  };

  const handleCropZoomChange = (value: number) => {
    if (!cropImage) return;
    const nextZoom = Number(value.toFixed(2));
    setCropZoom(nextZoom);
    setCropOffset((current) => clampOffset(cropImage, nextZoom, current));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropImage) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cropOffset.x,
      originY: cropOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropImage || !dragRef.current || dragRef.current.pointerId !== event.pointerId) return;

    setCropOffset(
      clampOffset(cropImage, cropZoom, {
        x: dragRef.current.originX + (event.clientX - dragRef.current.startX),
        y: dragRef.current.originY + (event.clientY - dragRef.current.startY),
      }),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCropCancel = () => {
    setCropDialogOpen(false);
    setCropImage(null);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
  };

  const handleCropSave = async () => {
    if (!user || !cropImage) return;

    setUploadingAvatar(true);

    try {
      const image = await loadImage(cropImage.src);
      const rendered = getRenderedSize(cropImage, cropZoom);
      const sourceX = (-cropOffset.x / rendered.width) * cropImage.width;
      const sourceY = (-cropOffset.y / rendered.height) * cropImage.height;
      const sourceWidth = (CROP_FRAME_SIZE / rendered.width) * cropImage.width;
      const sourceHeight = (CROP_FRAME_SIZE / rendered.height) * cropImage.height;

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_AVATAR_SIZE;
      canvas.height = OUTPUT_AVATAR_SIZE;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Не удалось подготовить фото для сохранения');

      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        OUTPUT_AVATAR_SIZE,
        OUTPUT_AVATAR_SIZE,
      );

      let compressedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITIES[0]);
      for (const quality of JPEG_QUALITIES.slice(1)) {
        if (compressedDataUrl.length <= MAX_SAVED_DATA_URL_LENGTH) break;
        compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      if (compressedDataUrl.length > MAX_SAVED_DATA_URL_LENGTH) {
        throw new Error('Фото всё ещё слишком большое после сжатия. Попробуйте другое изображение.');
      }

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: compressedDataUrl })
        .eq('user_id', user.id);

      if (error) throw new Error(error.message);

      setAvatarUrl(compressedDataUrl);
      setCropDialogOpen(false);
      setCropImage(null);
      toast.success('Фото обрезано и сохранено');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить фото');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleVerificationButtonClick = () => {
    if (isVerified) {
      toast.success('Профиль уже подтверждён');
      return;
    }
    verificationInputRef.current?.click();
  };

  const handleVerificationSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!user || !file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Сделайте фото паспорта');
      event.target.value = '';
      return;
    }

    setSubmittingVerification(true);

    try {
      const documentUrl = await compressImageToDataUrl(file, 1400, 0.8);

      if (verification?.status === 'pending' || verification?.status === 'rejected') {
        const { error } = await supabase
          .from('verifications')
          .update({
            document_url: documentUrl,
            status: 'pending',
            reviewer_id: null,
            review_notes: null,
          })
          .eq('id', verification.id);

        if (error) throw new Error(error.message);

        setVerification((current) =>
          current
            ? {
                ...current,
                document_url: documentUrl,
                status: 'pending',
                reviewer_id: null,
                review_notes: null,
              }
            : current,
        );
      } else {
        const { data, error } = await supabase
          .from('verifications')
          .insert({
            user_id: user.id,
            document_url: documentUrl,
            status: 'pending',
          })
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        setVerification(data);
      }

      toast.success('Фото паспорта отправлено на проверку');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось отправить верификацию');
    } finally {
      setSubmittingVerification(false);
      event.target.value = '';
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone || null,
        bio: bio || null,
        avatar_url: avatarUrl || null,
      })
      .eq('user_id', user.id);

    if (error) {
      toast.error('Ошибка сохранения');
    } else {
      toast.success('Профиль обновлён!');
    }

    setSaving(false);
  };

  const telegramConnectUrl = useMemo(() => {
    if (!TELEGRAM_BOT_USERNAME || !telegramSubscription?.connect_token) return '';
    return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${telegramSubscription.connect_token}`;
  }, [telegramSubscription?.connect_token]);

  if (loading) return <p className="p-8 text-center text-body">Загрузка...</p>;

  const rendered = cropImage ? getRenderedSize(cropImage, cropZoom) : null;

  if (isRequesterOnly) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", paddingBottom: 110, position: "relative" }} className="sf-theme">
        <SoftPinkBackground density={7} seed={99} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ padding: "16px 20px 0" }}>
            <Logo size="md" />
          </div>

          <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 20px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative", marginBottom: 4 }}>
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: "linear-gradient(145deg, #e0d0d0, #c8b8b8)", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", boxShadow: "0 4px 16px rgba(0,0,0,0.13)" }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={fullName || "Profile"} style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <svg viewBox="0 0 24 24" width="50" height="50" fill="none" stroke="#999" strokeWidth="1.3">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              {isVerified && (
                <div style={{ position: "absolute", bottom: 4, right: 4, width: 26, height: 26, borderRadius: "50%", background: "#1B2CC1", color: "#fff", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", boxShadow: "0 1px 6px rgba(0,0,0,0.2)" }}>
                  ✓
                </div>
              )}
            </div>

            <div style={{ fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: -0.2 }}>
              {fullName || user?.email || "Profile"}
            </div>

            <StarRating value={Math.round(averageRating ?? 0)} readonly size={34} />

            <div style={{ background: "#FDE8EA", borderRadius: 14, padding: "16px 18px", width: "100%", marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                About me:
              </div>
              <div style={{ fontSize: 14, color: "#333", lineHeight: 1.65 }}>{bio || '"Tell others about yourself!"'}</div>
            </div>

            <div style={{ width: "100%", height: 1.5, background: "#1B2CC1", opacity: 0.3 }} />

            <div style={{ background: "#FDE8EA", borderRadius: 14, width: "100%", overflow: "hidden" }}>
              <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#111" }}>Verify Account !</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleVerificationButtonClick}
                    disabled={submittingVerification}
                    style={{ padding: "8px 16px", background: "#fff", border: "1.5px solid #ccc", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                  >
                    Upload documents
                  </button>
                  <input
                    ref={verificationInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleVerificationSelect}
                    className="hidden"
                  />
                  {isVerified && (
                    <span style={{ fontSize: 13, color: "#1B2CC1", fontWeight: 600 }}>✓ Your account is verified</span>
                  )}
                  {!isVerified && verification?.status === "pending" && (
                    <span style={{ fontSize: 13, color: "#1B2CC1", fontWeight: 600 }}>✓ Your documents are submitted</span>
                  )}
                  {!isVerified && verification?.status === "rejected" && (
                    <span style={{ fontSize: 13, color: "#E03A1E", fontWeight: 600 }}>✕ Verification rejected</span>
                  )}
                </div>
              </div>

              <div style={{ padding: "16px 18px" }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#111" }}>Telegram notifications</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!telegramConnectUrl) {
                        toast.error("Укажите VITE_TELEGRAM_BOT_USERNAME, чтобы открыть бота");
                        return;
                      }
                      window.open(telegramConnectUrl, "_blank", "noopener,noreferrer");
                    }}
                    style={{ padding: "8px 16px", background: "#fff", border: "1.5px solid #ccc", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                  >
                    go to Telegram-Bot
                  </button>
                  <span style={{ fontSize: 13, color: "#666" }}>Activate your telegram notifications</span>
                </div>
              </div>
            </div>

            <button onClick={signOut} style={{ width: "100%", padding: "14px", background: "#E03A1E", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: "pointer", boxShadow: "0 3px 12px rgba(224,58,30,0.25)", marginTop: 4 }}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff", paddingBottom: 110, position: "relative" }} className="sf-theme">
      <SoftPinkBackground density={7} seed={77} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ padding: "16px 20px 0" }}>
          <Logo size="md" />
        </div>

        <form
          onSubmit={handleSave}
          style={{ maxWidth: 520, margin: "0 auto", padding: "20px 20px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        >
          <div style={{ position: "relative", marginBottom: 4 }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", background: "linear-gradient(145deg, #e0d0d0, #c8b8b8)", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", boxShadow: "0 4px 16px rgba(0,0,0,0.13)" }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName || "Profile"} style={{ width: 92, height: 92, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="#999" strokeWidth="1.3">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
            {isVerified && (
              <div style={{ position: "absolute", bottom: 4, right: 4, width: 26, height: 26, borderRadius: "50%", background: "#1B2CC1", color: "#fff", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", boxShadow: "0 1px 6px rgba(0,0,0,0.2)" }}>
                ✓
              </div>
            )}
          </div>

          <div style={{ fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: -0.2 }}>
            {fullName || user?.email || "Profile"}
          </div>

          {roles.includes('volunteer') && (
            <StarRating value={Math.round(averageRating ?? 0)} readonly size={34} />
          )}

          {roles.includes('volunteer') && (
            <button
              type="button"
              onClick={() => setReviewsDialogOpen(true)}
              style={{ fontSize: 13, color: "#1B2CC1", fontWeight: 700, textDecoration: "underline", marginTop: -2 }}
            >
              {reviews.length} reviews
            </button>
          )}

          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            style={{ padding: "10px 16px", background: "#fff", border: "1.5px solid #ccc", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}
          >
            Change photo
          </button>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarSelect}
            className="hidden"
          />

          <div style={{ background: "#FDE8EA", borderRadius: 14, padding: "16px 18px", width: "100%", marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              About me:
            </div>
            <Textarea
              id="bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="min-h-[110px] text-body"
              placeholder="Tell others about yourself"
            />
          </div>

          <div style={{ background: "#FDE8EA", borderRadius: 14, padding: "16px 18px", width: "100%" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Profile details
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <Label htmlFor="fullName" className="text-body font-bold">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="min-h-tap text-body"
                />
              </div>
              <div>
                <Label htmlFor="phone" className="text-body font-bold">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="min-h-tap text-body"
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
            </div>
          </div>

          <div style={{ width: "100%", height: 1.5, background: "#1B2CC1", opacity: 0.3 }} />

          <div style={{ background: "#FDE8EA", borderRadius: 14, width: "100%", overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#111" }}>Verify Account !</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleVerificationButtonClick}
                  disabled={submittingVerification}
                  style={{ padding: "8px 16px", background: "#fff", border: "1.5px solid #ccc", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                >
                  {submittingVerification ? "Uploading..." : "Upload Documents"}
                </button>
                <input
                  ref={verificationInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleVerificationSelect}
                  className="hidden"
                />
                {isVerified && (
                  <span style={{ fontSize: 13, color: "#1B2CC1", fontWeight: 600 }}>✓ Your account is verified</span>
                )}
                {!isVerified && verification?.status === "pending" && (
                  <span style={{ fontSize: 13, color: "#1B2CC1", fontWeight: 600 }}>✓ Your documents are submitted</span>
                )}
                {!isVerified && verification?.status === "rejected" && (
                  <span style={{ fontSize: 13, color: "#E03A1E", fontWeight: 600 }}>✕ Verification rejected</span>
                )}
              </div>
            </div>

            <div style={{ padding: "16px 18px" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#111" }}>Telegram notifications</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!telegramConnectUrl) {
                      toast.error("Укажите VITE_TELEGRAM_BOT_USERNAME, чтобы открыть бота");
                      return;
                    }
                    window.open(telegramConnectUrl, "_blank", "noopener,noreferrer");
                  }}
                  style={{ padding: "8px 16px", background: "#fff", border: "1.5px solid #ccc", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                >
                  go to Telegram-Bot
                </button>
                <span style={{ fontSize: 13, color: "#666" }}>
                  {telegramSubscription?.chat_id ? "Telegram connected" : "Activate your telegram notifications"}
                </span>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={saving || uploadingAvatar}
            className="w-full min-h-tap text-body font-bold bg-[#1B2CC1] text-white hover:bg-[#152099]"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </form>
      </div>

      <Dialog open={cropDialogOpen} onOpenChange={(open) => !open && !uploadingAvatar && handleCropCancel()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Обрезать фото</DialogTitle>
            <DialogDescription>
              Перетащите изображение внутри рамки и настройте масштаб. Мы автоматически уменьшим и сожмём фото перед сохранением.
            </DialogDescription>
          </DialogHeader>

          {cropImage && rendered && (
            <div className="space-y-4">
              <div
                className="relative mx-auto overflow-hidden rounded-2xl border bg-muted touch-none"
                style={{ width: CROP_FRAME_SIZE, height: CROP_FRAME_SIZE }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <img
                  src={cropImage.src}
                  alt="Предпросмотр обрезки"
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={{
                    width: rendered.width,
                    height: rendered.height,
                    transform: `translate(${cropOffset.x}px, ${cropOffset.y}px)`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-primary/70" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Масштаб</span>
                  <span>{cropZoom.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={cropZoom}
                  onChange={(event) => handleCropZoomChange(Number(event.target.value))}
                  className="w-full"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={handleCropCancel} disabled={uploadingAvatar}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={handleCropSave}
                  disabled={uploadingAvatar}
                  className="bg-[#1B2CC1] text-white hover:bg-[#152099]"
                >
                  {uploadingAvatar ? 'Сохраняем...' : 'Сохранить фото'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={reviewsDialogOpen} onOpenChange={setReviewsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Отзывы о волонтёре</DialogTitle>
            <DialogDescription>
              Здесь собраны комментарии заказчиков по завершённым задачам.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[420px] space-y-3 overflow-y-auto">
            {reviews.length === 0 && (
              <div className="rounded-lg border p-4 text-body text-muted-foreground">
                Пока отзывов нет.
              </div>
            )}

            {reviews.map((review) => (
              <div key={review.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-bold text-primary">{renderStars(review.rating)}</p>
                  <p className="text-sm text-muted-foreground">{formatReviewDate(review.created_at)}</p>
                </div>
                <p className="mt-3 text-body">
                  {review.comment || 'Комментарий не был добавлен.'}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
