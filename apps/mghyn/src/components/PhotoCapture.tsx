import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Upload, X, Image as ImageIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface PhotoCaptureProps {
  /** Display name of the client this photo attaches to. */
  patientName: string;
  /** Optional customer profile id to bind the photo to the electronic record. */
  customerId?: string | null;
  label?: string;
}

/**
 * Live camera capture + file upload for clinical / consultation photographs.
 * Captured images are saved (base64) to the patient's electronic profile via
 * the prescription_photos record.
 */
export function PhotoCapture({ patientName, customerId, label = "Clinical / Progress Photos" }: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [shots, setShots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => stopCam(), []);

  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }

  async function startCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
    } catch {
      toast.error("Camera unavailable — use Upload instead.");
    }
  }

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    setShots((s) => [...s, canvas.toDataURL("image/jpeg", 0.7)]);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => setShots((s) => [...s, String(reader.result)]);
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  }

  async function save() {
    if (shots.length === 0) return;
    setSaving(true);
    const rows = shots.map((image_data) => ({
      image_data,
      caption: `${patientName} · ${new Date().toLocaleString()}`,
      customer_id: customerId ?? null,
    }));
    const { error } = await supabase.from("prescription_photos").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${shots.length} photo(s) saved to ${patientName}'s record`);
    setShots([]);
    stopCam();
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" /> {label}
      </div>

      {camOn && (
        <div className="relative mb-2 overflow-hidden rounded-md bg-black">
          <video ref={videoRef} className="h-40 w-full object-cover" playsInline muted />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!camOn ? (
          <Button type="button" size="sm" variant="outline" onClick={startCam}>
            <Camera className="mr-1 h-4 w-4" /> Open Camera
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" onClick={snap}><Camera className="mr-1 h-4 w-4" /> Capture</Button>
            <Button type="button" size="sm" variant="ghost" onClick={stopCam}><RotateCcw className="mr-1 h-4 w-4" /> Stop</Button>
          </>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" /> Upload
        </Button>
        <Input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFile} />
      </div>

      {shots.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {shots.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`shot ${i + 1}`} className="h-16 w-16 rounded-md object-cover" />
                <button
                  type="button"
                  onClick={() => setShots((s) => s.filter((_, idx) => idx !== i))}
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" className="mt-2 w-full" onClick={save} disabled={saving}>
            {saving ? "Saving…" : `Save ${shots.length} to Profile`}
          </Button>
        </>
      )}
    </div>
  );
}
