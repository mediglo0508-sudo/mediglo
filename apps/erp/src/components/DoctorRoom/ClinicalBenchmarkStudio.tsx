import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Camera, FileSignature, Crosshair, CheckCircle2, RotateCcw, Send } from "lucide-react";

interface QuickRxTemplate {
  id: string;
  title: string;
  concern: string;
  diagnosis: string;
  medications: string[];
  recommendedServices: string[];
  instructions: string;
}

const QUICK_RX_TEMPLATES: QuickRxTemplate[] = [
  {
    id: "acne-scar",
    title: "Acne & Post-Acne Scar Protocol",
    concern: "Grade II/III inflammatory acne with boxcar & rolling post-acne scars",
    diagnosis: "Acne Vulgaris with Atrophic Post-Acne Scarring (ICD-10: L70.0)",
    medications: [
      "Tab. Doxycycline 100mg — 1 tab OD after dinner × 14 days",
      "Adapalene 0.1% + Clindamycin 1% Gel — Apply thin layer at night",
      "Oil-Free Broad Spectrum Sunscreen SPF 50 PA++++ — Every 3 hours (Morning/Noon)",
      "Ceramide Barrier Repair Moisturizer — Apply BD",
    ],
    recommendedServices: [
      "Acne Buster Peel (Full Face)",
      "Dermapen 4",
      "Morpheus 8 (MNRF)",
    ],
    instructions: "Avoid active retinoids 3 days prior to Dermapen 4 / Peel session. Strict photoprotection mandatory.",
  },
  {
    id: "melasma-qswitch",
    title: "Melasma & Pigmentation Q-Switch Protocol",
    concern: "Bilateral malar hyperpigmentation & uneven skin tone",
    diagnosis: "Epidermal-Dermal Mixed Melasma & PIH (ICD-10: L81.1)",
    medications: [
      "Tab. Tranexamic Acid 250mg — 1 tab BD after meals × 30 days",
      "Tab. Liposomal Vitamin C 1000mg + Glutathione 500mg — 1 tab OD morning",
      "Kojic Acid 2% + Arbutin + Niacinamide Depigmenting Serum — Apply night",
      "Tinted Mineral Sunscreen SPF 50+ — Apply every 3 hours",
    ],
    recommendedServices: [
      "Laser Toning (Q-Switch Laser)",
      "The Glow Drip (Glutathione)",
      "Cosmelan",
    ],
    instructions: "Schedule Q-Switch Laser Toning every 3 weeks (6 sessions) paired with weekly Glow Drip.",
  },
  {
    id: "hair-prp-gfc",
    title: "Androgenetic Alopecia PRP + GFC + QR678 Protocol",
    concern: "Progressive crown & frontal hair thinning with increased telogen shedding",
    diagnosis: "Androgenetic Alopecia + Telogen Effluvium (ICD-10: L64.9)",
    medications: [
      "Minoxidil 5% + Finasteride 0.1% Topical Solution — 1ml twice daily on dry scalp",
      "Tab. Biotin 10mg + Saw Palmetto + Amino Acid Complex — 1 tab OD after breakfast",
      "Ketoconazole 2% Anti-Dandruff Scalp Wash — Twice weekly",
    ],
    recommendedServices: [
      "Scalp PRP (GFC)",
      "QR 678 Hair Loss Treatment",
      "Exosome (For Scalp)",
    ],
    instructions: "Shampoo scalp morning of PRP/GFC session. Avoid hair oil or styling sprays for 24 hours post-procedure.",
  },
  {
    id: "anti-aging-botox",
    title: "Anti-Aging Botox, Profhilo & HIFU MedLift Protocol",
    concern: "Dynamic forehead/glabellar rhytids, mid-face volume laxity & jawline sagging",
    diagnosis: "Facial Photoaging & Dynamic Rhytids (ICD-10: L57.8)",
    medications: [
      "Peptide + Hyaluronic Acid Intensive Serum — Apply twice daily",
      "Retinol 0.5% Night Renewal Cream — Apply alternate nights (start 5 days post-procedure)",
      "SPF 50+ Broad Spectrum Sunscreen — Daily morning",
    ],
    recommendedServices: [
      "Botox",
      "Booster (Profhilo/Remedium/Skinvive/Aakaar)",
      "HIFU MedLift",
    ],
    instructions: "Do not lie flat or rub treated zones for 4 hours post-Botox. Avoid sauna/steam/gym for 48 hours.",
  },
  {
    id: "korean-glass-iv",
    title: "Bridal / Korean Glass Skin & Longevity IV Protocol",
    concern: "Dull dehydrated skin, open pores & pre-event radiance enhancement",
    diagnosis: "Cutaneous Dehydration & Textural Dullness",
    medications: [
      "Hyaluronic Acid + Panthenol B5 Hydrating Serum — Apply BD",
      "Liposomal Glutathione Oral Sachet — 1 sachet daily morning",
      "Ultra-Light Invisible Sunscreen SPF 50 — Apply morning & noon",
    ],
    recommendedServices: [
      "Korean Glass Facial",
      "MediGlo Signature IV Drip(customised drip)",
      "Aqua Gold Treatment",
    ],
    instructions: "Maintain 3L daily water intake. Repeat MediGlo Signature IV Drip every 7 days for 4 weeks.",
  },
];

interface AnatomicalMark {
  id: string;
  zone: string;
  x: number;
  y: number;
  type: "Botox (Units)" | "Filler (ml)" | "Laser (J/cm²)" | "PRP / Booster";
  dosage: string;
}

const CONSENT_PROCEDURES = [
  "Laser Hair Reduction (Numitec / Triton / Soprano Titanium)",
  "Q-Switch Laser Toning / Carbon Peel",
  "Chemical Peel (Glycolic / Salicylic / Yellow / Cosmelan)",
  "Botox & Hyaluronic Acid Dermal Fillers / Profhilo",
  "HIFU MedLift / Morpheus 8 / Exion MNRF",
  "IV Glutathione / NAD+ / Myers Cocktail Infusion Therapy",
  "Scalp / Face PRP (GFC) & Dermapen 4 Microneedling",
];

export function ClinicalBenchmarkStudio() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [patientName, setPatientName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<QuickRxTemplate | null>(QUICK_RX_TEMPLATES[0]);
  const [customDiagnosis, setCustomDiagnosis] = useState(QUICK_RX_TEMPLATES[0].diagnosis);
  const [customMeds, setCustomMeds] = useState(QUICK_RX_TEMPLATES[0].medications.join("\n"));
  const [customServices, setCustomServices] = useState(QUICK_RX_TEMPLATES[0].recommendedServices.join(", "));
  const [customNotes, setCustomNotes] = useState(QUICK_RX_TEMPLATES[0].instructions);
  const [savingRx, setSavingRx] = useState(false);

  // Before / After comparison state
  const [sliderPos, setSliderPos] = useState(50);
  const [beforeLabel, setBeforeLabel] = useState("Baseline — Session 1 (Pre-Treatment)");
  const [afterLabel, setAfterLabel] = useState("Follow-Up — Session 4 (Post Q-Switch + Glow Drip)");
  const [beforeImg, setBeforeImg] = useState<string>("");
  const [afterImg, setAfterImg] = useState<string>("");

  // Anatomical charting state
  const [marks, setMarks] = useState<AnatomicalMark[]>([
    { id: "m1", zone: "Glabella (Frown Lines)", x: 50, y: 28, type: "Botox (Units)", dosage: "20 U" },
    { id: "m2", zone: "Forehead Frontalis", x: 50, y: 18, type: "Botox (Units)", dosage: "12 U" },
    { id: "m3", zone: "Left Crow's Feet", x: 30, y: 34, type: "Botox (Units)", dosage: "12 U" },
    { id: "m4", zone: "Right Crow's Feet", x: 70, y: 34, type: "Botox (Units)", dosage: "12 U" },
    { id: "m5", zone: "Bilateral Malar Cheeks", x: 36, y: 50, type: "Filler (ml)", dosage: "1.0 ml Profhilo" },
  ]);
  const [activeMarkType, setActiveMarkType] = useState<AnatomicalMark["type"]>("Botox (Units)");
  const [activeDosage, setActiveDosage] = useState("4 U");

  // Digital Consent state
  const [consentProcedure, setConsentProcedure] = useState(CONSENT_PROCEDURES[0]);
  const [consentSignedBy, setConsentSignedBy] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const { data: recentPatients } = useQuery({
    queryKey: ["clinical-studio-patients"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, phone").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  function applyQuickTemplate(t: QuickRxTemplate) {
    setSelectedTemplate(t);
    setCustomDiagnosis(t.diagnosis);
    setCustomMeds(t.medications.join("\n"));
    setCustomServices(t.recommendedServices.join(", "));
    setCustomNotes(t.instructions);
    toast.success(`Loaded "${t.title}" in 1 click!`);
  }

  async function saveQuickRxAndRoute() {
    const targetPatient = patientName.trim() || "Walk-In Patient";
    setSavingRx(true);
    try {
      const chartSummary = marks.map((m) => `${m.zone}: ${m.type} (${m.dosage})`).join(" | ");
      const fullNotes = `Diagnosis: ${customDiagnosis}\nMedications:\n${customMeds}\nSuggested Treatments: ${customServices}\nAnatomical Map: ${chartSummary}\nInstructions: ${customNotes}`;

      if (user?.id) {
        await supabase.from("doctor_prescriptions").insert({
          doctor_id: user.id,
          customer_name: targetPatient,
          diagnosis: customDiagnosis,
          clinical_notes: fullNotes,
          instructions: customNotes,
          status: "finalized",
          finalized_at: new Date().toISOString(),
        });
      }

      // Also push to patient_visits so Counselor Room & Pharmacy receive it automatically
      await supabase.from("patient_visits").insert({
        customer_name: targetPatient,
        status: "counselor",
        area_of_interest: customServices,
        prescription: fullNotes,
        counselor_notes: `Doctor Recommended: ${customServices} (By ${profile?.full_name || "Doctor"})`,
        seen_doctor: true,
      } as never);

      qc.invalidateQueries({ queryKey: ["consult-visits"] });
      toast.success(`Digital Prescription saved for ${targetPatient} & routed to Counselor Room + Pharmacy Queue!`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save Quick-Rx");
    } finally {
      setSavingRx(false);
    }
  }

  function handleFaceClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    let zone = "Facial Zone";
    if (y < 24) zone = "Forehead / Frontalis";
    else if (y < 32 && x >= 42 && x <= 58) zone = "Glabella";
    else if (y < 40 && (x < 38 || x > 62)) zone = "Periorbital / Crow's Feet";
    else if (y < 45) zone = "Tear Trough / Under-Eye";
    else if (y < 60) zone = "Malar Cheek / Mid-Face";
    else if (y < 72 && x >= 40 && x <= 60) zone = "Perioral / Lips";
    else if (y < 82) zone = "Jawline / Masseter";
    else zone = "Chin / Submental Neck";

    setMarks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), zone, x, y, type: activeMarkType, dosage: activeDosage },
    ]);
  }

  function handleFileUpload(side: "before" | "after", file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (side === "before") setBeforeImg(String(reader.result));
      else setAfterImg(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  // Canvas signature handlers
  function startDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.strokeStyle = "#3E1119";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  }

  function moveDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  }

  function endDraw() {
    setIsDrawing(false);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function saveSignedConsent() {
    const target = consentSignedBy.trim() || patientName.trim() || "Patient";
    const canvas = canvasRef.current;
    const sigData = canvas ? canvas.toDataURL("image/png") : "";
    await supabase.from("prescription_photos").insert({
      caption: `SIGNED CONSENT: ${consentProcedure} — Signed by ${target} on ${new Date().toLocaleString()}`,
      image_data: sigData || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    toast.success(`Digital Consent for "${consentProcedure}" signed by ${target} and saved to CRM Timeline!`);
  }

  return (
    <Card className="mt-6 border-primary/20 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
            Enterprise Clinical Studio (Quick-Rx · Anatomical Charting · Before/After · E-Consent)
          </h3>
          <p className="text-xs text-muted-foreground">
            Clinicea, Eka Care, Redicase & Practo Ray benchmark tools integrated directly with Counselor, Pharmacy & CRM
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            list="studio-patients-list"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Select or type Patient Name…"
            className="h-9 w-64 text-xs"
          />
          <datalist id="studio-patients-list">
            {(recentPatients ?? []).map((p) => (
              <option key={p.id} value={p.name ?? ""}>
                {p.phone}
              </option>
            ))}
          </datalist>
        </div>
      </div>

      <Tabs defaultValue="quick-rx">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="quick-rx">
            <Sparkles className="mr-1.5 h-4 w-4" /> 1-Click Dermatology Quick-Rx
          </TabsTrigger>
          <TabsTrigger value="charting-photos">
            <Crosshair className="mr-1.5 h-4 w-4" /> Anatomical Charting & Before/After Studio
          </TabsTrigger>
          <TabsTrigger value="consent">
            <FileSignature className="mr-1.5 h-4 w-4" /> Digital Consent & E-Signature
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: 1-CLICK QUICK-RX */}
        <TabsContent value="quick-rx" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_RX_TEMPLATES.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={selectedTemplate?.id === t.id ? "default" : "outline"}
                onClick={() => applyQuickTemplate(t)}
                className="text-xs"
              >
                {t.title}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Clinical Diagnosis (ICD-10)</Label>
                <Input value={customDiagnosis} onChange={(e) => setCustomDiagnosis(e.target.value)} className="mt-1 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Doctor Suggested Treatments & Packages (Auto-routed to Counselor Room)</Label>
                <Input value={customServices} onChange={(e) => setCustomServices(e.target.value)} className="mt-1 text-xs font-medium text-primary" />
              </div>
              <div>
                <Label className="text-xs">Post-Care & Clinical Instructions</Label>
                <Textarea value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} rows={3} className="mt-1 text-xs" />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Prescribed Pharmacy Medications (Auto-routed to Pharmacy Queue)</Label>
                <Textarea value={customMeds} onChange={(e) => setCustomMeds(e.target.value)} rows={6} className="mt-1 font-mono text-xs" />
              </div>
              <Button className="w-full" onClick={saveQuickRxAndRoute} disabled={savingRx}>
                <Send className="mr-2 h-4 w-4" />
                {savingRx ? "Routing Prescription…" : "Save Digital Prescription & Route to Counselor + Pharmacy"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: ANATOMICAL CHARTING & BEFORE/AFTER PHOTO SLIDER */}
        <TabsContent value="charting-photos">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Interactive Facial Anatomical Chart */}
            <div className="rounded-xl border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold">Interactive Facial Injection & Laser Mapping</h4>
                  <p className="text-[11px] text-muted-foreground">Click anywhere on the facial diagram to plot units, ml, or laser fluences</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMarks([])}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Clear Marks
                </Button>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <Select value={activeMarkType} onValueChange={(v) => setActiveMarkType(v as AnatomicalMark["type"])}>
                  <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Botox (Units)">Botox (Units)</SelectItem>
                    <SelectItem value="Filler (ml)">Filler (ml)</SelectItem>
                    <SelectItem value="Laser (J/cm²)">Laser (J/cm²)</SelectItem>
                    <SelectItem value="PRP / Booster">PRP / Booster</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={activeDosage}
                  onChange={(e) => setActiveDosage(e.target.value)}
                  placeholder="Dosage (e.g. 4 U, 0.5 ml)"
                  className="h-8 w-36 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-center">
                <div className="relative mx-auto w-52 h-64 rounded-xl border bg-rose-50/40 flex items-center justify-center">
                  <svg
                    viewBox="0 0 100 120"
                    className="h-full w-full cursor-crosshair"
                    onClick={handleFaceClick}
                  >
                    {/* Facial Contour */}
                    <ellipse cx="50" cy="58" rx="32" ry="42" fill="#FFF5F5" stroke="#8C3B4A" strokeWidth="1.5" />
                    {/* Forehead lines */}
                    <path d="M 32 24 Q 50 20 68 24" fill="none" stroke="#D4A5AE" strokeWidth="0.8" strokeDasharray="2,2" />
                    {/* Eyebrows */}
                    <path d="M 28 36 Q 38 31 45 35" fill="none" stroke="#5A222B" strokeWidth="1.5" />
                    <path d="M 55 35 Q 62 31 72 36" fill="none" stroke="#5A222B" strokeWidth="1.5" />
                    {/* Eyes */}
                    <ellipse cx="36" cy="42" rx="6" ry="3" fill="none" stroke="#5A222B" strokeWidth="1.2" />
                    <ellipse cx="64" cy="42" rx="6" ry="3" fill="none" stroke="#5A222B" strokeWidth="1.2" />
                    {/* Nose */}
                    <path d="M 50 38 L 47 58 Q 50 61 53 58 Z" fill="none" stroke="#8C3B4A" strokeWidth="1.1" />
                    {/* Nasolabial folds */}
                    <path d="M 42 58 Q 36 68 38 75" fill="none" stroke="#D4A5AE" strokeWidth="0.9" />
                    <path d="M 58 58 Q 64 68 62 75" fill="none" stroke="#D4A5AE" strokeWidth="0.9" />
                    {/* Lips */}
                    <path d="M 40 72 Q 50 68 60 72 Q 50 79 40 72 Z" fill="#F4B8C1" stroke="#8C3B4A" strokeWidth="1.1" />
                    {/* Neck */}
                    <path d="M 36 96 L 34 116 M 64 96 L 66 116" stroke="#8C3B4A" strokeWidth="1.2" />

                    {/* Plotted Injection / Laser Points */}
                    {marks.map((m, idx) => (
                      <g key={m.id}>
                        <circle cx={m.x} cy={(m.y / 100) * 120} r="3.2" fill="#3E1119" stroke="#F59E0B" strokeWidth="1.2" />
                        <text x={m.x + 4} y={(m.y / 100) * 120 + 2} fontSize="4.5" fill="#3E1119" fontWeight="bold">
                          #{idx + 1} ({m.dosage})
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 text-xs">
                  <p className="font-semibold text-muted-foreground">Mapped Procedure Sites ({marks.length}):</p>
                  {marks.map((m, idx) => (
                    <div key={m.id} className="flex items-center justify-between rounded border bg-muted/30 px-2.5 py-1.5">
                      <div>
                        <span className="font-bold text-primary">#{idx + 1} {m.zone}</span>
                        <div className="text-[11px] text-muted-foreground">{m.type}</div>
                      </div>
                      <Badge variant="secondary">{m.dosage}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Visual Before & After Photo Comparison Studio */}
            <div className="rounded-xl border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-bold">
                    <Camera className="h-4 w-4 text-primary" /> Visual Before & After Comparison Studio
                  </h4>
                  <p className="text-[11px] text-muted-foreground">Drag the comparison slider to inspect clinical transformation</p>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <Label className="text-[11px]">Before Photo (Upload optional)</Label>
                  <Input type="file" accept="image/*" className="mt-1 h-8 text-[11px]" onChange={(e) => handleFileUpload("before", e.target.files?.[0] ?? null)} />
                </div>
                <div>
                  <Label className="text-[11px]">After Photo (Upload optional)</Label>
                  <Input type="file" accept="image/*" className="mt-1 h-8 text-[11px]" onChange={(e) => handleFileUpload("after", e.target.files?.[0] ?? null)} />
                </div>
              </div>

              <div className="relative h-52 w-full overflow-hidden rounded-xl border bg-gradient-to-r from-rose-100 via-amber-50 to-emerald-50">
                {/* After Layer (Full width underneath) */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/10 p-4 text-center">
                  {afterImg ? (
                    <img src={afterImg} alt="After" className="h-full w-full object-cover" />
                  ) : (
                    <div>
                      <Badge className="bg-emerald-700 text-white">AFTER TREATMENT</Badge>
                      <p className="mt-2 text-sm font-bold text-emerald-950">{afterLabel}</p>
                      <p className="mt-1 text-xs text-emerald-800">Pigmentation reduced by 78% · Dermal luminosity +42%</p>
                    </div>
                  )}
                </div>

                {/* Before Layer (Clipped by sliderPos) */}
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-primary bg-rose-950/15"
                  style={{ width: `${sliderPos}%` }}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                    {beforeImg ? (
                      <img src={beforeImg} alt="Before" className="h-full w-full object-cover" />
                    ) : (
                      <div>
                        <Badge variant="outline" className="bg-background font-bold">BEFORE (BASELINE)</Badge>
                        <p className="mt-2 text-sm font-bold text-rose-950">{beforeLabel}</p>
                        <p className="mt-1 text-xs text-rose-900">Grade II Malar Melasma & Post-Acne Erythema</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <span className="text-[11px] font-semibold text-muted-foreground">Before</span>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={sliderPos}
                  onChange={(e) => setSliderPos(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <span className="text-[11px] font-semibold text-muted-foreground">After</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: DIGITAL CONSENT & E-SIGNATURE PAD */}
        <TabsContent value="consent">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border bg-background p-4">
              <div>
                <Label className="text-xs">Select Clinical Procedure Consent Template</Label>
                <Select value={consentProcedure} onValueChange={setConsentProcedure}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONSENT_PROCEDURES.map((cp) => (
                      <SelectItem key={cp} value={cp} className="text-xs">{cp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Patient / Guardian Full Name</Label>
                <Input
                  value={consentSignedBy || patientName}
                  onChange={(e) => setConsentSignedBy(e.target.value)}
                  placeholder="Enter patient full name for consent record"
                  className="mt-1 h-9 text-xs"
                />
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="font-bold text-foreground">Informed Clinical Consent Declaration:</p>
                <p className="mt-1">
                  I hereby authorize the medical doctors and certified clinical therapists at <strong>MediGlo Harmony Clinic</strong> to perform{" "}
                  <strong>{consentProcedure}</strong>. The nature of the procedure, expected outcomes, pre/post-treatment precautions, and potential transient effects (erythema, mild edema, or photosensitivity) have been explained to me in detail.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border bg-background p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold">Patient Digital E-Signature Pad (Sign with mouse/touch)</Label>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSignature}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Clear Pad
                </Button>
              </div>
              <canvas
                ref={canvasRef}
                width={420}
                height={140}
                onMouseDown={startDraw}
                onMouseMove={moveDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                className="w-full cursor-crosshair rounded-lg border-2 border-dashed border-primary/30 bg-amber-50/20"
              />
              <Button className="w-full" onClick={saveSignedConsent}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Save Signed Digital Consent to Patient CRM Profile
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
