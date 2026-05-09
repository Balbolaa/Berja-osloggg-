import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface ReportDialogProps {
  reportedUserId: string;
  trigger?: React.ReactNode;
}

const ReportDialog = ({ reportedUserId, trigger }: ReportDialogProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reason.trim()) return;
    setLoading(true);

    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_user_id: reportedUserId,
      reason: reason.trim(),
      details: details.trim() || null,
    });

    if (error) {
      toast.error('Ошибка отправки жалобы');
    } else {
      toast.success('Жалоба отправлена');
      setOpen(false);
      setReason('');
      setDetails('');
    }
    setLoading(false);
  };

  const handleBlock = async () => {
    if (!user) return;
    await supabase.from('blocked_users').insert({
      blocker_id: user.id,
      blocked_id: reportedUserId,
    });
    toast.success('Пользователь заблокирован');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="lg" className="min-h-tap font-bold text-destructive border-destructive">
            ⚠️ Пожаловаться
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-heading-sm">Пожаловаться</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-body font-bold">Причина</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="min-h-[80px] text-body"
              placeholder="Опишите проблему..."
            />
          </div>
          <div className="space-y-2">
            <Label className="text-body font-bold">Подробности (необязательно)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="min-h-[80px] text-body"
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={loading} size="lg" className="min-h-tap font-bold flex-1">
              Отправить жалобу
            </Button>
            <Button type="button" variant="outline" size="lg" className="min-h-tap font-bold" onClick={handleBlock}>
              🚫 Заблокировать
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
