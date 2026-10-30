export interface RegistrationSheetData {
  id?: string;
  registration_date?: string;
  first_name: string;
  last_name: string;
  gender: string;
  gender_other?: string;
  dob?: string;
  age?: number | string;
  address?: string;
  city?: string;
  mobile_no: string;
  email?: string;
  profession?: string;
  profession_other?: string;
  skin_problems?: string[];
  skin_problems_other?: string;
  hair_problems?: string[];
  hair_problems_other?: string;
  body_concerns?: string[];
  body_concerns_other?: string;
  wellbeing_concerns?: string[];
  wellbeing_concerns_other?: string;
  longevity_concerns?: string[];
  clinics_visited_earlier_1?: string;
  clinics_visited_earlier_2?: string;
  medical_conditions?: string[];
  medical_conditions_other?: string;
  prescription_medicines?: string;
  has_allergies?: boolean | number;
  allergy_details?: string;
  referral_source?: string;
  referral_source_other?: string;
  receive_updates?: boolean | number;
  signature_data?: string;
  signature_timestamp?: string;
}

export function printOfficialRegistrationSheet(data: RegistrationSheetData) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow pop-ups to print the registration form.");
    return;
  }

  const fullName = `${(data.first_name || "").toUpperCase()} ${data.last_name || ""}`.trim();
  const regDate = data.registration_date || new Date().toISOString().slice(0, 10);
  const skinList = (data.skin_problems || []).concat(data.skin_problems_other ? [`Other: ${data.skin_problems_other}`] : []).join(", ") || "None selected";
  const hairList = (data.hair_problems || []).concat(data.hair_problems_other ? [`Other: ${data.hair_problems_other}`] : []).join(", ") || "None selected";
  const bodyList = (data.body_concerns || []).concat(data.body_concerns_other ? [`Other: ${data.body_concerns_other}`] : []).join(", ") || "None selected";
  const wellList = (data.wellbeing_concerns || []).concat(data.wellbeing_concerns_other ? [`Other: ${data.wellbeing_concerns_other}`] : []).join(", ") || "None selected";
  const longList = (data.longevity_concerns || []).join(", ") || "None selected";
  const medList = (data.medical_conditions || []).concat(data.medical_conditions_other ? [`Other: ${data.medical_conditions_other}`] : []).join(", ") || "None reported";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MediGlo Clinic - Official Registration Form - ${fullName}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.35; color: #1e293b; margin: 0; padding: 0; }
    .header { text-align: center; border-bottom: 2px solid #991b1b; padding-bottom: 8px; margin-bottom: 12px; }
    .clinic-name { font-size: 20px; font-weight: 800; color: #991b1b; letter-spacing: 0.5px; text-transform: uppercase; }
    .clinic-sub { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 2px; }
    .form-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 4px; letter-spacing: 0.2px; text-transform: uppercase; }
    .section-title { font-size: 11px; font-weight: 700; background: #f1f5f9; padding: 4px 8px; border-left: 3px solid #991b1b; text-transform: uppercase; margin: 10px 0 6px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    td, th { padding: 4px 6px; text-align: left; vertical-align: top; border: 1px solid #e2e8f0; font-size: 10.5px; }
    .label { font-weight: 600; color: #475569; width: 22%; background: #f8fafc; }
    .val { color: #0f172a; }
    .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 6px; margin: 6px 0; }
    .alert-title { color: #b91c1c; font-weight: 700; font-size: 10.5px; margin-bottom: 2px; }
    .terms { font-size: 9px; line-height: 1.3; color: #475569; border: 1px solid #cbd5e1; padding: 6px; border-radius: 4px; background: #f8fafc; }
    .terms h5 { margin: 0 0 2px 0; font-size: 9.5px; color: #0f172a; text-transform: uppercase; }
    .terms p { margin: 0 0 4px 0; }
    .sig-container { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; border-top: 1px solid #cbd5e1; padding-top: 8px; }
    .sig-box { text-align: center; width: 220px; }
    .sig-img { max-width: 180px; max-height: 60px; border-bottom: 1px dashed #94a3b8; display: block; margin: 0 auto; }
    .sig-label { font-size: 10px; font-weight: 600; color: #334155; margin-top: 4px; }
    .sig-date { font-size: 9px; color: #64748b; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="clinic-name">MEDIGLO CLINIC</div>
    <div class="clinic-sub">Aesthetic Medicine · Dermatology · Trichology · Longevity</div>
    <div class="form-title">Client Registration, Medical Profile & Consent Form</div>
  </div>

  <div class="section-title">Section A: Personal & Contact Information</div>
  <table>
    <tr>
      <td class="label">Date of Reg.:</td><td class="val">${regDate}</td>
      <td class="label">Patient Name:</td><td class="val"><strong>${fullName}</strong></td>
    </tr>
    <tr>
      <td class="label">Mobile Number:</td><td class="val"><strong>${data.mobile_no || "N/A"}</strong></td>
      <td class="label">Email Address:</td><td class="val">${data.email || "N/A"}</td>
    </tr>
    <tr>
      <td class="label">Date of Birth:</td><td class="val">${data.dob || "N/A"} (Age: ${data.age || "N/A"} yrs)</td>
      <td class="label">Gender:</td><td class="val">${data.gender}${data.gender_other ? ` (${data.gender_other})` : ""}</td>
    </tr>
    <tr>
      <td class="label">City / State:</td><td class="val">${data.city || "Gurugram"}, Haryana</td>
      <td class="label">Profession:</td><td class="val">${data.profession || "N/A"}${data.profession_other ? ` (${data.profession_other})` : ""}</td>
    </tr>
    <tr>
      <td class="label">Full Address:</td><td class="val" colspan="3">${data.address || "N/A"}</td>
    </tr>
  </table>

  <div class="section-title">Section B: Client Concerns & Goals</div>
  <table>
    <tr><td class="label">Skin Concerns:</td><td class="val">${skinList}</td></tr>
    <tr><td class="label">Hair / Scalp:</td><td class="val">${hairList}</td></tr>
    <tr><td class="label">Body & Toning:</td><td class="val">${bodyList}</td></tr>
    <tr><td class="label">Well-being:</td><td class="val">${wellList}</td></tr>
    <tr><td class="label">Longevity:</td><td class="val">${longList}</td></tr>
  </table>

  <div class="section-title">Section C: Medical Profile & Past History</div>
  <table>
    <tr>
      <td class="label">Medical Conditions:</td>
      <td class="val" colspan="3"><strong>${medList}</strong></td>
    </tr>
    <tr>
      <td class="label">Prior Clinics Visited:</td>
      <td class="val" colspan="3">1. ${data.clinics_visited_earlier_1 || "None"} &nbsp;&nbsp;|&nbsp;&nbsp; 2. ${data.clinics_visited_earlier_2 || "None"}</td>
    </tr>
    <tr>
      <td class="label">Medicines (Last 1 Yr):</td>
      <td class="val" colspan="3">${data.prescription_medicines || "None specified"}</td>
    </tr>
    <tr>
      <td class="label">Drug / Skin Allergies:</td>
      <td class="val" colspan="3" style="${data.has_allergies ? 'color: #b91c1c; font-weight: bold;' : ''}">
        ${data.has_allergies ? `⚠️ YES: ${data.allergy_details || "Unspecified reaction"}` : "No known drug/skin allergies"}
      </td>
    </tr>
    <tr>
      <td class="label">Referral Source:</td>
      <td class="val">${data.referral_source || "Walk-in"}${data.referral_source_other ? ` (${data.referral_source_other})` : ""}</td>
      <td class="label">Receive Updates:</td>
      <td class="val">${data.receive_updates ? "Yes (Opted In)" : "No"}</td>
    </tr>
  </table>

  <div class="section-title">Section D: Clinic Terms, Conditions & Consent Declaration</div>
  <div class="terms">
    <h5>1. Consultation Validity:</h5>
    <p>The initial doctor consultation fee is valid for fifteen (15) days from the date of the first visit. If enrolled in a treatment package (PKG), all package-related follow-up consultations are complimentary until the completion of the final session plus a three (3) week after-care window. Any subsequent consultation beyond this period will be charged as a new consultation.</p>
    <h5>2. Refund Policy:</h5>
    <p>MediGlo Clinic maintains a strict NO-REFUND policy once treatments or packages are booked. Refunds are considered only in exceptional circumstances where the client is certified medically unfit by our medical director to undergo the prescribed procedure.</p>
    <h5>3. Payment & Installment Terms:</h5>
    <p>Full payment in a single transaction is preferred. For split installments, 60% of the total treatment cost must be deposited upfront, and the remaining 40% balance must be cleared within fifteen (15) days.</p>
    <h5>4. Patient Consent Declaration:</h5>
    <p><strong>"The information provided by me is true and accurate to the best of my knowledge. I hereby grant my voluntary, informed consent to be examined, consulted, treated, and photographed for clinical record-keeping and progress evaluation."</strong></p>
  </div>

  <div class="sig-container">
    <div>
      <div style="font-size: 10px; color: #64748b;">Official MediGlo Verification Stamp:</div>
      <div style="margin-top: 15px; font-weight: 700; color: #991b1b;">VERIFIED & FILED TO CRM</div>
      <div class="sig-date">Date: ${regDate}</div>
    </div>
    <div class="sig-box">
      ${data.signature_data ? `<img src="${data.signature_data}" class="sig-img" alt="Patient Digital Signature" />` : `<div style="height: 40px; border-bottom: 1px dashed #94a3b8;"></div>`}
      <div class="sig-label">Client Digital Signature</div>
      <div class="sig-date">Signed: ${data.signature_timestamp || regDate}</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
