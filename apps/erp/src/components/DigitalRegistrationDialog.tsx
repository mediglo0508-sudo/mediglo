import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, UserCheck, Loader2, Sparkles, HeartPulse, ShieldCheck } from "lucide-react";
import { AREAS_OF_INTEREST } from "@/lib/constants";

interface DigitalRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (customer: { id: string; name: string; phone: string | null }) => void;
  defaultCheckIn?: boolean;
}

export function DigitalRegistrationDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultCheckIn = false,
}: DigitalRegistrationDialogProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState("Female");
  const [city, setCity] = useState("Gurugram");
  const [stateCode, setStateCode] = useState("06"); // 06 - Haryana
  const [areaOfInterest, setAreaOfInterest] = useState<string>(AREAS_OF_INTEREST[0] || "Acne & Scars");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [medicalHistory, setMedicalHistory] = useState("");
  const [allergies, setAllergies] = useState("");
  const [referralSource, setReferralSource] = useState("Walk-in");
  const [skinType, setSkinType] = useState("Type III (Indian Wheatish)");

  function resetForm() {
    setName("");
    setPhone("");
    setEmail("");
    setAge("");
    setGender("Female");
    setCity("Gurugram");
    setStateCode("06");
    setAreaOfInterest(AREAS_OF_INTEREST[0] || "Acne & Scars");
    setChiefComplaint("");
    setMedicalHistory("");
    setAllergies("");
    setReferralSource("Walk-in");
    setSkinType("Type III (Indian Wheatish)");
  }

  async function handleRegister(andCheckIn = false) {
    if (!name.trim()) {
      return toast.error("Please enter the patient's full name");
    }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) {
      return toast.error("Please enter a valid 10-digit mobile number");
    }

    setLoading(true);
    try {
      const cleanPhone = phone.trim();
      const customerCode = `MG-${Date.now().toString().slice(-4)}`;
      const combinedNotes = [
        chiefComplaint ? `Complaint: ${chiefComplaint}` : null,
        medicalHistory ? `Medical: ${medicalHistory}` : null,
        allergies ? `Allergies: ${allergies}` : null,
        skinType ? `Skin Type: ${skinType}` : null,
        referralSource ? `Source: ${referralSource}` : null,
      ].filter(Boolean).join(" | ");

      // 1. Insert Customer Record
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .insert({
          name: name.trim(),
          phone: cleanPhone,
          email: email.trim() || null,
          age: age ? Number(age) : null,
          gender: gender || null,
          city: city.trim() || "Gurugram",
          state_code: stateCode || "06",
          client_type: "New",
          customer_code: customerCode,
          outstanding_balance: 0,
          internal_notes: combinedNotes || null,
        })
        .select()
        .single();

      if (customerError) {
        throw customerError;
      }

      const createdCustomer = customerData || {
        id: "id-" + Math.random().toString(36).slice(2, 10),
        name: name.trim(),
        phone: cleanPhone,
      };

      // 2. If Check-In requested, add active patient_visit at Reception
      if (andCheckIn) {
        const { error: visitError } = await (supabase as any).from("patient_visits").insert({
          customer_id: createdCustomer.id,
          customer_name: createdCustomer.name,
          phone: cleanPhone,
          area_of_interest: areaOfInterest,
          status: "reception",
        });
        if (visitError) {
          console.warn("Could not auto check-in visit:", visitError);
        } else {
          toast.success(`Patient check-in recorded for Reception Desk!`);
        }
      }

      toast.success(`Patient "${name.trim()}" registered successfully!`);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["reception-visits"] });

      if (onSuccess) {
        onSuccess(createdCustomer);
      }

      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Registration error:", err);
      toast.error(err.message || "Failed to register patient");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Digital Patient Registration & Intake</DialogTitle>
              <DialogDescription>
                Fast-track digital onboarding form for new clinical and aesthetic clients.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Section 1: Basic Demographics */}
          <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> 1. Patient Demographics
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="reg-name" className="text-xs font-medium">Full Name *</Label>
                <Input
                  id="reg-name"
                  placeholder="e.g. Ananya Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-phone" className="text-xs font-medium">Mobile Phone (10 digits) *</Label>
                <Input
                  id="reg-phone"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-9"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="reg-age" className="text-xs font-medium">Age</Label>
                <Input
                  id="reg-age"
                  type="number"
                  placeholder="28"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="h-9"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Gender</Label>
                <Select value={gender} onValueChange={setGender} disabled={loading}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-email" className="text-xs font-medium">Email ID</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="ananya@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="reg-city" className="text-xs font-medium">City</Label>
                <Input
                  id="reg-city"
                  placeholder="Gurugram"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="h-9"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">State (GST Code)</Label>
                <Select value={stateCode} onValueChange={setStateCode} disabled={loading}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="06">06 - Haryana (Intra-state)</SelectItem>
                    <SelectItem value="07">07 - Delhi</SelectItem>
                    <SelectItem value="09">09 - Uttar Pradesh</SelectItem>
                    <SelectItem value="08">08 - Rajasthan</SelectItem>
                    <SelectItem value="27">27 - Maharashtra</SelectItem>
                    <SelectItem value="29">29 - Karnataka</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Section 2: Clinical Area of Interest & Complaint */}
          <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <HeartPulse className="h-3.5 w-3.5 text-rose-500" /> 2. Clinical Interest & Intake
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Area of Interest / Service</Label>
                <Select value={areaOfInterest} onValueChange={setAreaOfInterest} disabled={loading}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AREAS_OF_INTEREST.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Fitzpatrick Skin Phototype</Label>
                <Select value={skinType} onValueChange={setSkinType} disabled={loading}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Type II (Fair)">Type II (Fair)</SelectItem>
                    <SelectItem value="Type III (Indian Wheatish)">Type III (Indian Wheatish)</SelectItem>
                    <SelectItem value="Type IV (Indian Dusky)">Type IV (Indian Dusky)</SelectItem>
                    <SelectItem value="Type V (Deep Brown)">Type V (Deep Brown)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="reg-complaint" className="text-xs font-medium">Chief Complaint / Primary Concern</Label>
              <Textarea
                id="reg-complaint"
                placeholder="Describe specific skin/hair/body concerns, duration, prior treatments..."
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                rows={2}
                className="text-xs"
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="reg-allergies" className="text-xs font-medium flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-amber-500" /> Known Allergies
                </Label>
                <Input
                  id="reg-allergies"
                  placeholder="e.g. Latex, Penicillin, Lidocaine, None"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  className="h-9 text-xs"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-history" className="text-xs font-medium">Medical History / Contraindications</Label>
                <Input
                  id="reg-history"
                  placeholder="e.g. Thyroid, Keloid, Roaccutane, Pregnancy"
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  className="h-9 text-xs"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Referral Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">How did you hear about us?</Label>
              <Select value={referralSource} onValueChange={setReferralSource} disabled={loading}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Walk-in">Walk-in</SelectItem>
                  <SelectItem value="Instagram / Social Media">Instagram / Social Media</SelectItem>
                  <SelectItem value="Google Search / Maps">Google Search / Maps</SelectItem>
                  <SelectItem value="Friend / Family Referral">Friend / Family Referral</SelectItem>
                  <SelectItem value="Doctor Referral">Doctor Referral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => handleRegister(false)}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Register Client Only
          </Button>

          <Button
            type="button"
            onClick={() => handleRegister(true)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Register & Check-In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
