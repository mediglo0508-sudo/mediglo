import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  UserPlus, UserCheck, Loader2, Sparkles, AlertTriangle, ShieldCheck,
  Printer, CheckCircle2, RotateCcw, PenTool, FileText, ArrowRight, Info
} from "lucide-react";
import { printOfficialRegistrationSheet } from "@/lib/print-registration-sheet";

const SKIN_OPTIONS = ["Dull Skin", "Pigmentation", "Acne", "Scars", "Tanning", "Ageing"];
const HAIR_OPTIONS = ["Hair loss/Thinning", "Dandruff / Scalp Issues", "Bald Patches", "Premature Greying"];
const BODY_OPTIONS = ["Unwanted Hair Growth", "Unwanted fat/Cellulite", "Loose Skin", "Stretch Marks", "Body pigmentation"];
const WELLBEING_OPTIONS = ["Mental Health", "Pain Management", "Lack of Energy/Fatigue", "Low Immunity"];
const LONGEVITY_OPTIONS = ["Premature Ageing", "Slow Metabolism", "Poor detoxification", "Nutritional Deficiency"];
const MEDICAL_CONDITIONS = [
  "Hypertension", "Diabetes", "Asthma", "Thyroid", "Keloids",
  "Kidney/Liver Disease", "Auto immune Disorder", "Cardiovascular Disease",
  "Any Implant in body", "Hormonal disorder (PCOs)"
];
const REFERRAL_SOURCES = ["Friend/Relative", "Instagram", "Facebook", "Internet", "Clinic Board", "Just walked in", "Bloggers"];

interface Props {
  onSuccess?: (registeredData: any) => void;
  onCancel?: () => void;
  isKiosk?: boolean;
  defaultCheckIn?: boolean;
}

export function DigitalClientRegistrationForm({
  onSuccess,
  onCancel,
  isKiosk = false,
  defaultCheckIn = false,
}: Props) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState<any | null>(null);

  // Section A: Personal & Contact
  const [regDate, setRegDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("Female");
  const [genderOther, setGenderOther] = useState("");
  const [dob, setDob] = useState("");
  const [age, setAge] = useState<string>("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Gurugram");
  const [mobileNo, setMobileNo] = useState("");
  const [email, setEmail] = useState("");

  // Section B: Concerns
  const [profession, setProfession] = useState("Salaried Professional");
  const [professionOther, setProfessionOther] = useState("");

  const [skinProblems, setSkinProblems] = useState<string[]>([]);
  const [skinOther, setSkinOther] = useState("");

  const [hairProblems, setHairProblems] = useState<string[]>([]);
  const [hairOther, setHairOther] = useState("");

  const [bodyConcerns, setBodyConcerns] = useState<string[]>([]);
  const [bodyOther, setBodyOther] = useState("");

  const [wellbeingConcerns, setWellbeingConcerns] = useState<string[]>([]);
  const [wellbeingOther, setWellbeingOther] = useState("");

  const [longevityConcerns, setLongevityConcerns] = useState<string[]>([]);

  // Section C: Medical Profile & Referral
  const [clinicEarlier1, setClinicEarlier1] = useState("");
  const [clinicEarlier2, setClinicEarlier2] = useState("");

  const [medConditions, setMedConditions] = useState<string[]>([]);
  const [medConditionOther, setMedConditionOther] = useState("");

  const [prescriptions, setPrescriptions] = useState("");

  const [hasAllergies, setHasAllergies] = useState(false);
  const [allergyDetails, setAllergyDetails] = useState("");

  const [referralSource, setReferralSource] = useState("Instagram");
  const [referralOther, setReferralOther] = useState("");

  const [receiveUpdates, setReceiveUpdates] = useState(true);

  // Section D: Signature & Terms
  const [consentAgreed, setConsentAgreed] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [sigTimestamp, setSigTimestamp] = useState("");

  // Auto-calculate Age from DOB
  useEffect(() => {
    if (!dob) return;
    const birthDate = new Date(dob);
    if (!isNaN(birthDate.getTime())) {
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      if (calculatedAge >= 0 && calculatedAge < 120) {
        setAge(calculatedAge.toString());
      }
    }
  }, [dob]);

  // Setup Canvas Signature Pad
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
  }, []);

  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
    setSigTimestamp(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setSigTimestamp("");
  }

  function toggleArrayItem(arr: string[], setArr: (v: string[]) => void, item: string) {
    if (arr.includes(item)) {
      setArr(arr.filter((i) => i !== item));
    } else {
      setArr([...arr, item]);
    }
  }

  async function handleSubmit(checkIn = false) {
    if (!firstName.trim()) {
      return toast.error("Please enter patient's First Name");
    }
    const cleanMobile = mobileNo.trim().replace(/\D/g, "");
    if (cleanMobile.length < 10) {
      return toast.error("Please enter a valid 10-digit mobile number");
    }
    if (hasAllergies && !allergyDetails.trim()) {
      return toast.error("Please provide specific details of drug/skin allergies");
    }
    if (!consentAgreed) {
      return toast.error("Client consent declaration must be accepted to register");
    }
    if (!hasSignature) {
      return toast.error("Please provide client digital signature in Section D");
    }

    setSubmitting(true);
    try {
      const canvas = canvasRef.current;
      const signatureData = canvas ? canvas.toDataURL("image/png") : null;
      const timestampString = new Date().toISOString();

      const registrationRecord = {
        registration_date: regDate,
        first_name: firstName.trim().toUpperCase(),
        last_name: lastName.trim(),
        gender,
        gender_other: gender === "Others" ? genderOther : null,
        dob: dob || null,
        age: age ? Number(age) : null,
        address: address.trim() || null,
        city: city.trim() || "Gurugram",
        mobile_no: cleanMobile,
        email: email.trim() || null,
        profession,
        profession_other: profession === "Other" ? professionOther : null,
        skin_problems: skinProblems,
        skin_problems_other: skinOther.trim() || null,
        hair_problems: hairProblems,
        hair_problems_other: hairOther.trim() || null,
        body_concerns: bodyConcerns,
        body_concerns_other: bodyOther.trim() || null,
        wellbeing_concerns: wellbeingConcerns,
        wellbeing_concerns_other: wellbeingOther.trim() || null,
        longevity_concerns: longevityConcerns,
        clinics_visited_earlier_1: clinicEarlier1.trim() || null,
        clinics_visited_earlier_2: clinicEarlier2.trim() || null,
        medical_conditions: medConditions,
        medical_conditions_other: medConditionOther.trim() || null,
        prescription_medicines: prescriptions.trim() || null,
        has_allergies: hasAllergies ? 1 : 0,
        allergy_details: hasAllergies ? allergyDetails.trim() : null,
        referral_source: referralSource,
        referral_source_other: referralSource === "Others" ? referralOther.trim() : null,
        receive_updates: receiveUpdates ? 1 : 0,
        signature_data: signatureData,
        signature_timestamp: timestampString,
        consent_agreed: 1,
      };

      // 1. Insert into client_registrations table (Auto-upserts customer)
      const { data: savedRecord, error: regError } = await (supabase as any)
        .from("client_registrations")
        .insert(registrationRecord)
        .select()
        .single();

      if (regError) {
        throw regError;
      }

      // 2. If staff clicked "Register & Check-In", create active reception queue visit
      if (checkIn) {
        const areaOfInterest = skinProblems[0] || hairProblems[0] || bodyConcerns[0] || "Consultation";
        await (supabase as any).from("patient_visits").insert({
          customer_name: `${firstName.trim().toUpperCase()} ${lastName.trim()}`.trim(),
          phone: cleanMobile,
          area_of_interest: areaOfInterest,
          status: "reception",
        });
        toast.success("Patient successfully added to Reception Desk queue!");
      }

      toast.success(`Registration filed for ${firstName.trim().toUpperCase()} ${lastName.trim()}!`);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["client_registrations"] });
      qc.invalidateQueries({ queryKey: ["reception-visits"] });

      const finalRecord = { ...registrationRecord, id: savedRecord?.id };
      setSubmittedData(finalRecord);

      if (onSuccess) {
        onSuccess(finalRecord);
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      toast.error(err.message || "Failed to save registration record");
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedData) {
    return (
      <Card className="p-8 max-w-2xl mx-auto text-center space-y-6 bg-card border shadow-lg">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Registration Completed Successfully</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Client profile and medical consent record have been securely filed in the Master Client 360° CRM.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-muted/40 border text-left space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Client Name:</span> <strong>{(submittedData.first_name || "").toUpperCase()} {submittedData.last_name || ""}</strong></div>
            <div><span className="text-muted-foreground">Mobile:</span> <strong>{submittedData.mobile_no}</strong></div>
            <div><span className="text-muted-foreground">City:</span> {submittedData.city}</div>
            <div><span className="text-muted-foreground">Date:</span> {submittedData.registration_date}</div>
          </div>
          {submittedData.has_allergies === 1 && (
            <div className="mt-2 p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
              Critical Medical Alert: {submittedData.allergy_details}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            onClick={() => printOfficialRegistrationSheet(submittedData)}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold"
          >
            <Printer className="h-4 w-4" /> Print Signed Official Form
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setSubmittedData(null);
              setFirstName("");
              setLastName("");
              setMobileNo("");
              setEmail("");
              setDob("");
              setAge("");
              setAddress("");
              clearSignature();
            }}
          >
            Register Another Client
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${isKiosk ? "max-w-4xl mx-auto py-6 px-4" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
              MediGlo Official Intake
            </span>
            <span className="text-xs text-muted-foreground">Confidential Medical Record</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Client Registration & Medical Consent
          </h2>
          <p className="text-xs text-muted-foreground">
            Please complete the four sections below accurately. All clinical data is securely stored.
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <Label className="text-xs text-muted-foreground">Registration Date</Label>
          <Input
            type="date"
            value={regDate}
            onChange={(e) => setRegDate(e.target.value)}
            className="h-8 text-xs font-medium w-36"
          />
        </div>
      </div>

      {/* SECTION A: Personal & Contact Information */}
      <Card className="p-5 border space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
            A
          </div>
          <h3 className="font-semibold text-base text-foreground">Personal & Contact Information</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-medium">First Name * (Auto-Capitalized)</Label>
            <Input
              placeholder="e.g. ANANYA"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value.toUpperCase())}
              className="font-medium uppercase"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Last Name</Label>
            <Input
              placeholder="e.g. Sharma"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Gender *</Label>
            <RadioGroup value={gender} onValueChange={setGender} className="flex items-center gap-3 pt-1">
              <div className="flex items-center gap-1.5"><RadioGroupItem value="Female" id="g-female" /><Label htmlFor="g-female" className="text-xs cursor-pointer">Female</Label></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="Male" id="g-male" /><Label htmlFor="g-male" className="text-xs cursor-pointer">Male</Label></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="Others" id="g-other" /><Label htmlFor="g-other" className="text-xs cursor-pointer">Others</Label></div>
            </RadioGroup>
            {gender === "Others" && (
              <Input
                placeholder="Specify gender"
                value={genderOther}
                onChange={(e) => setGenderOther(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Date of Birth</Label>
            <Input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Age (Years)</Label>
            <Input
              type="number"
              placeholder="e.g. 29"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Mobile Number (10 digits) * (Primary Key)</Label>
            <Input
              placeholder="e.g. 9876543210"
              value={mobileNo}
              onChange={(e) => setMobileNo(e.target.value)}
              className="font-medium tracking-wide"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Email Address</Label>
            <Input
              type="email"
              placeholder="e.g. ananya@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs font-medium">Residential Address</Label>
            <Input
              placeholder="Apartment, Street / Locality"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">City</Label>
            <Input
              placeholder="e.g. Gurugram"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* SECTION B: Client Concerns */}
      <Card className="p-5 border space-y-5">
        <div className="flex items-center gap-2 border-b pb-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
            B
          </div>
          <h3 className="font-semibold text-base text-foreground">Client Concerns & Lifestyle</h3>
        </div>

        {/* Profession */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profession</Label>
          <RadioGroup value={profession} onValueChange={setProfession} className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {["Business", "Homemaker", "Student", "Salaried Professional", "Other"].map((p) => (
              <div key={p} className="flex items-center gap-1.5 border rounded-md p-2 hover:bg-muted/40 cursor-pointer">
                <RadioGroupItem value={p} id={`prof-${p}`} />
                <Label htmlFor={`prof-${p}`} className="text-xs cursor-pointer font-medium">{p}</Label>
              </div>
            ))}
          </RadioGroup>
          {profession === "Other" && (
            <Input
              placeholder="Specify profession"
              value={professionOther}
              onChange={(e) => setProfessionOther(e.target.value)}
              className="h-8 text-xs max-w-sm mt-1"
            />
          )}
        </div>

        {/* Skin Problems */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Skin Problems (Select all that apply)</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SKIN_OPTIONS.map((item) => (
              <div key={item} className="flex items-center gap-2 border rounded-md p-2 text-xs hover:bg-muted/30">
                <Checkbox
                  id={`skin-${item}`}
                  checked={skinProblems.includes(item)}
                  onCheckedChange={() => toggleArrayItem(skinProblems, setSkinProblems, item)}
                />
                <Label htmlFor={`skin-${item}`} className="cursor-pointer">{item}</Label>
              </div>
            ))}
          </div>
          <Input
            placeholder="Other skin concerns..."
            value={skinOther}
            onChange={(e) => setSkinOther(e.target.value)}
            className="h-8 text-xs mt-1"
          />
        </div>

        {/* Hair Problems */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Hair Problems (Select all that apply)</Label>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
            {HAIR_OPTIONS.map((item) => (
              <div key={item} className="flex items-center gap-2 border rounded-md p-2 text-xs hover:bg-muted/30">
                <Checkbox
                  id={`hair-${item}`}
                  checked={hairProblems.includes(item)}
                  onCheckedChange={() => toggleArrayItem(hairProblems, setHairProblems, item)}
                />
                <Label htmlFor={`hair-${item}`} className="cursor-pointer">{item}</Label>
              </div>
            ))}
          </div>
          <Input
            placeholder="Other hair / scalp concerns..."
            value={hairOther}
            onChange={(e) => setHairOther(e.target.value)}
            className="h-8 text-xs mt-1"
          />
        </div>

        {/* Body Concerns */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">3. Body Concerns</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BODY_OPTIONS.map((item) => (
              <div key={item} className="flex items-center gap-2 border rounded-md p-2 text-xs hover:bg-muted/30">
                <Checkbox
                  id={`body-${item}`}
                  checked={bodyConcerns.includes(item)}
                  onCheckedChange={() => toggleArrayItem(bodyConcerns, setBodyConcerns, item)}
                />
                <Label htmlFor={`body-${item}`} className="cursor-pointer">{item}</Label>
              </div>
            ))}
          </div>
          <Input
            placeholder="Other body concerns..."
            value={bodyOther}
            onChange={(e) => setBodyOther(e.target.value)}
            className="h-8 text-xs mt-1"
          />
        </div>

        {/* Well-being & Longevity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">4. Well-Being</Label>
            <div className="space-y-1.5">
              {WELLBEING_OPTIONS.map((item) => (
                <div key={item} className="flex items-center gap-2 border rounded-md p-2 text-xs hover:bg-muted/30">
                  <Checkbox
                    id={`well-${item}`}
                    checked={wellbeingConcerns.includes(item)}
                    onCheckedChange={() => toggleArrayItem(wellbeingConcerns, setWellbeingConcerns, item)}
                  />
                  <Label htmlFor={`well-${item}`} className="cursor-pointer">{item}</Label>
                </div>
              ))}
              <Input
                placeholder="Other well-being concerns..."
                value={wellbeingOther}
                onChange={(e) => setWellbeingOther(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">5. Longevity & Cellular Health</Label>
            <div className="space-y-1.5">
              {LONGEVITY_OPTIONS.map((item) => (
                <div key={item} className="flex items-center gap-2 border rounded-md p-2 text-xs hover:bg-muted/30">
                  <Checkbox
                    id={`long-${item}`}
                    checked={longevityConcerns.includes(item)}
                    onCheckedChange={() => toggleArrayItem(longevityConcerns, setLongevityConcerns, item)}
                  />
                  <Label htmlFor={`long-${item}`} className="cursor-pointer">{item}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION C: Medical Profile & Referral */}
      <Card className="p-5 border space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
            C
          </div>
          <h3 className="font-semibold text-base text-foreground">Medical Profile & Past Clinical History</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Skin/Hair Clinics Visited Earlier (1)</Label>
            <Input
              placeholder="Clinic name & city"
              value={clinicEarlier1}
              onChange={(e) => setClinicEarlier1(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Skin/Hair Clinics Visited Earlier (2)</Label>
            <Input
              placeholder="Clinic name & city"
              value={clinicEarlier2}
              onChange={(e) => setClinicEarlier2(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Medical Conditions (Critical Clinical Safety Screening)
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MEDICAL_CONDITIONS.map((cond) => (
              <div key={cond} className="flex items-center gap-2 border rounded-md p-2 text-xs hover:bg-muted/30">
                <Checkbox
                  id={`med-${cond}`}
                  checked={medConditions.includes(cond)}
                  onCheckedChange={() => toggleArrayItem(medConditions, setMedConditions, cond)}
                />
                <Label htmlFor={`med-${cond}`} className="cursor-pointer font-medium">{cond}</Label>
              </div>
            ))}
          </div>
          <Input
            placeholder="Any other medical condition..."
            value={medConditionOther}
            onChange={(e) => setMedConditionOther(e.target.value)}
            className="h-8 text-xs mt-1"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">Prescription Medicines Taken in the Last 1 Year</Label>
          <Textarea
            placeholder="List any ongoing medications, steroids, retinoids/roaccutane, blood thinners, hormonal pills..."
            value={prescriptions}
            onChange={(e) => setPrescriptions(e.target.value)}
            rows={2}
            className="text-xs"
          />
        </div>

        {/* Drug Reactions & Allergies Alert Box */}
        <div className={`p-4 rounded-lg border transition-colors ${hasAllergies ? "bg-rose-50/70 border-rose-200" : "bg-muted/20 border-slate-200"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${hasAllergies ? "text-rose-600" : "text-muted-foreground"}`} />
              <Label className="text-xs font-semibold">Any Drug Reactions or Allergies in the Past?</Label>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="allergies-radio"
                  checked={!hasAllergies}
                  onChange={() => setHasAllergies(false)}
                /> No
              </label>
              <label className="flex items-center gap-1 text-xs cursor-pointer font-bold text-rose-700">
                <input
                  type="radio"
                  name="allergies-radio"
                  checked={hasAllergies}
                  onChange={() => setHasAllergies(true)}
                /> Yes (Explain)
              </label>
            </div>
          </div>

          {hasAllergies && (
            <div className="mt-3 space-y-1">
              <Label className="text-xs font-medium text-rose-900">Specify details of past allergic reactions *</Label>
              <Input
                placeholder="e.g. Severe rash with Penicillin, Lidocaine sensitivity, Latex allergy"
                value={allergyDetails}
                onChange={(e) => setAllergyDetails(e.target.value)}
                className="text-xs bg-white border-rose-300"
              />
            </div>
          )}
        </div>

        {/* Referral & Updates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Where did you hear about Mediglo Clinic?</Label>
            <select
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-xs"
            >
              {REFERRAL_SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="Others">Others</option>
            </select>
            {referralSource === "Others" && (
              <Input
                placeholder="Specify source"
                value={referralOther}
                onChange={(e) => setReferralOther(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            )}
          </div>

          <div className="space-y-1 flex flex-col justify-end">
            <div className="flex items-center gap-2 border rounded-md p-2 text-xs bg-muted/20">
              <Checkbox
                id="rec-updates"
                checked={receiveUpdates}
                onCheckedChange={(c) => setReceiveUpdates(!!c)}
              />
              <Label htmlFor="rec-updates" className="cursor-pointer">
                Receive treatment updates & reminders from MediGlo Clinic
              </Label>
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION D: Terms, Conditions & Digital Signature */}
      <Card className="p-5 border space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
            D
          </div>
          <h3 className="font-semibold text-base text-foreground">Terms & Conditions + Digital Signature</h3>
        </div>

        {/* Clinic Policies Box */}
        <div className="p-4 rounded-lg bg-slate-50 border text-xs text-slate-700 space-y-3 leading-relaxed">
          <div>
            <h5 className="font-bold text-slate-900 uppercase">1. Consultation Validity:</h5>
            <p className="text-muted-foreground mt-0.5">
              The initial doctor consultation fee is valid for fifteen (15) days. If enrolled in a treatment package (PKG), all package-related follow-up consultations are complimentary until completion of the final procedure plus a 3-week after-care period. Any consultation after package completion is charged as a new consultation.
            </p>
          </div>
          <div>
            <h5 className="font-bold text-slate-900 uppercase">2. Refund Policy:</h5>
            <p className="text-muted-foreground mt-0.5">
              MediGlo Clinic follows a strict NO-REFUND policy. Refunds are only considered in exceptional cases where the client is medically certified unfit to undergo the procedure, subject to the medical director's evaluation.
            </p>
          </div>
          <div>
            <h5 className="font-bold text-slate-900 uppercase">3. Payment & Installments:</h5>
            <p className="text-muted-foreground mt-0.5">
              Full payment in a single transaction is preferred. For split payments, 60% of the treatment cost must be deposited upfront, and the remaining 40% balance must be cleared within fifteen (15) days of the initial payment.
            </p>
          </div>
        </div>

        {/* Consent Declaration */}
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20">
          <Checkbox
            id="consent-check"
            checked={consentAgreed}
            onCheckedChange={(c) => setConsentAgreed(!!c)}
            className="mt-0.5"
          />
          <Label htmlFor="consent-check" className="text-xs leading-normal cursor-pointer font-medium text-foreground">
            <strong>Consent Declaration:</strong> "The information provided by me is true to the best of my knowledge, and I have given my voluntary consent to be examined, consulted, treated, and photographed for clinical record-keeping."
          </Label>
        </div>

        {/* HTML5 Canvas Digital Signature Pad */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <PenTool className="h-3.5 w-3.5 text-primary" />
              Client Digital Signature * (Sign with finger, stylus or mouse)
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSignature}
              className="h-7 text-xs text-muted-foreground flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Clear Signature
            </Button>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-lg p-1 bg-white flex flex-col items-center">
            <canvas
              ref={canvasRef}
              width={540}
              height={140}
              className="touch-none w-full max-w-[540px] h-[140px] cursor-crosshair bg-white rounded"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            <div className="w-full text-right px-2 py-1 border-t border-slate-100 flex justify-between items-center text-[10px] text-muted-foreground">
              <span>Touch / Stylus / Mouse Enabled</span>
              {sigTimestamp && <span>Signed at {sigTimestamp}</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={() => handleSubmit(false)}
          disabled={submitting}
          className="w-full sm:w-auto flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Submit & File to CRM
        </Button>

        {!isKiosk && (
          <Button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold shadow-md"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Submit & Check-In at Reception
          </Button>
        )}
      </div>
    </div>
  );
}
