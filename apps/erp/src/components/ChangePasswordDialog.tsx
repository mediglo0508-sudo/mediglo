import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

export function ChangePasswordDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email) {
      toast.error("No signed-in email found.");
      return;
    }
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    if (next === current) {
      toast.error("New password must differ from the current password.");
      return;
    }

    setBusy(true);
    try {
      // 1. Verify the current password before allowing any update.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (verifyError) throw new Error("Current password is incorrect.");

      // 2. Apply the new password.
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;

      // 3. Security verification notice to the registered address.
      const { error: noticeError } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (noticeError) {
        console.warn("Password changed but security notice email failed:", noticeError.message);
      }

      toast.success(
        "Password updated. A security verification email was sent — if this was not you, secure your account immediately.",
      );
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="mr-2 h-4 w-4" /> Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Your current password is verified before the change is applied. A security verification email is
            sent to {user?.email ?? "your registered address"} afterwards.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current">Current Password</Label>
            <Input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-new">New Password</Label>
            <Input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm New Password</Label>
            <Input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
