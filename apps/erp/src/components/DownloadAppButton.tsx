import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";

// Captured beforeinstallprompt event (Chrome / Android / Desktop PWA install).
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function DownloadAppButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(!!isStandalone);

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    // Must run inside the user-click context — call prompt() synchronously first.
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }


  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" /> Download App
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install MediGlo ERP</DialogTitle>
          <DialogDescription>
            Install the app for one-tap access on any device — works offline-ready as a PWA.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {(installed || standalone) && <p className="rounded-lg bg-green-500/10 p-3 text-green-700">App is already installed on this device. 🎉</p>}
          {deferred && !installed && !standalone && (
            <Button className="w-full" onClick={install}>
              <Download className="mr-2 h-4 w-4" /> Install Now (Android / Desktop)
            </Button>
          )}
          {!deferred && !installed && !standalone && (
            <p className="rounded-lg bg-muted p-3 text-muted-foreground">
              If the one-tap install button doesn’t appear, use the manual steps below — the browser install prompt only shows on a supported browser over a secure (https) connection.
            </p>
          )}

          <div>
            <p className="mb-1 font-semibold">📱 Android (Chrome)</p>
            <p className="text-muted-foreground">Tap the “Install Now” button above, or open the browser menu → “Add to Home screen”.</p>
          </div>
          <div>
            <p className="mb-1 font-semibold">🍏 iPhone / iPad (Safari)</p>
            <p className="text-muted-foreground">Tap the Share icon → “Add to Home Screen”. The app opens full-screen like a native app.</p>
          </div>
          <div>
            <p className="mb-1 font-semibold">💻 Windows / Mac (Chrome / Edge)</p>
            <p className="text-muted-foreground">Click the install icon in the address bar, or use “Install Now” above.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
