import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { validateOnboardingDocumentFile } from '../utils/validation';

const YES_NO_OPTIONS = ['Yes', 'No'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'];
const EMPLOYMENT_TYPE_OPTIONS = ['Full-time', 'Contract', 'Intern'];
const ONBOARDING_STATUS_OPTIONS = ['draft', 'submitted', 'under_review', 'needs_changes', 'approved', 'rejected'];
const STATUS_BADGE_STYLES = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  needs_changes: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
};

const REQUIRED_EMPLOYEE_FIELDS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'gender',
  'blood_group',
  'phone_number',
  'email_address',
  'aadhaar_number',
  'pan_number',
  'father_name',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_phone',
  'current_address',
  'permanent_address',
  'city',
  'state',
  'pincode',
  'bank_name',
  'account_holder_name',
  'account_number',
  'ifsc_code',
  'upi_id',
  'salary_account',
  'highest_qualification',
  'degree',
  'college_university',
  'year_of_passing',
  'percentage_cgpa',
  'primary_skills',
  'tools_technologies',
  'linkedin_profile',
  'notice_period',
  'willing_to_relocate',
  'declaration_confirmed',
  'signature_consent'
];

const HR_MANAGED_FIELDS = [
  'employee_id',
  'department',
  'designation',
  'date_of_joining',
  'employment_type',
  'work_location',
  'reporting_manager',
  'offered_ctc_lpa',
  'fixed_salary',
  'variable_pay',
  'bonus',
  'pf_applicable',
  'esi_applicable'
];

const REQUIRED_DOCUMENT_FIELDS = [
  'aadhaar_card',
  'pan_card',
  'resume',
  'passport_photo',
  'cancelled_cheque_or_bank_proof'
];

function emptyPreviousCompany() {
  return {
    company_name: '',
    designation: '',
    duration: '',
    last_drawn_salary: '',
    reason_for_leaving: ''
  };
}

function emptyQualification() {
  return {
    qualification: '',
    degree: '',
    institution: '',
    year_of_passing: '',
    percentage_cgpa: ''
  };
}

function emptyProject() {
  return {
    project_name: '',
    role: '',
    technologies_used: '',
    duration: '',
    description: ''
  };
}

function emptyDocumentState() {
  return {
    aadhaar_card: '',
    pan_card: '',
    resume: '',
    passport_photo: '',
    experience_letters: '',
    previous_offer_letter: '',
    cancelled_cheque_or_bank_proof: ''
  };
}

function isNonEmpty(value) {
  return String(value || '').trim().length > 0;
}

function validateAadhaar(value) {
  return /^\d{12}$/.test(String(value || '').replace(/\s+/g, ''));
}

function validatePan(value) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(String(value || '').trim());
}

function validateIfsc(value) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(String(value || '').trim());
}

function validateUpi(value) {
  return /^[\w.-]+@[\w.-]+$/.test(String(value || '').trim());
}

function normalizeCommaSeparated(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ');
}

function formatStatusLabel(status) {
  return String(status || 'draft').replace(/_/g, ' ');
}

function defaultFormState() {
  return {
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    blood_group: '',
    phone_number: '',
    email_address: '',
    marital_status: '',

    aadhaar_number: '',
    pan_number: '',
    passport_number: '',

    father_name: '',
    mother_name: '',
    spouse_name: '',

    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
    emergency_contact_alternate_phone: '',

    current_address: '',
    permanent_address: '',
    city: '',
    state: '',
    pincode: '',

    bank_name: '',
    account_holder_name: '',
    account_number: '',
    ifsc_code: '',
    branch_name: '',
    upi_id: '',
    salary_account: '',

    employee_id: '',
    department: '',
    designation: '',
    date_of_joining: '',
    employment_type: '',
    work_location: '',
    reporting_manager: '',

    worked_before: 'No',
    previous_companies: [],

    offered_ctc_lpa: '',
    fixed_salary: '',
    variable_pay: '',
    bonus: '',
    pf_applicable: '',
    esi_applicable: '',

    highest_qualification: '',
    degree: '',
    college_university: '',
    year_of_passing: '',
    percentage_cgpa: '',
    qualifications: [emptyQualification()],

    primary_skills: '',
    secondary_skills: '',
    tools_technologies: '',
    certifications: '',

    projects: [emptyProject()],

    linkedin_profile: '',
    github_profile: '',
    portfolio_website: '',

    documents: emptyDocumentState(),

    notice_period: '',
    willing_to_relocate: '',

    onboarding_status: 'draft',
    review_comment: '',
    reviewed_by: '',
    reviewed_at: '',
    submitted_at: '',

    declaration_confirmed: false,
    signature_consent: ''
  };
}

function inputClass(disabled = false) {
  const base = 'field dark:border-slate-600 dark:bg-slate-700 dark:text-white';
  return disabled ? `${base} cursor-not-allowed bg-slate-100 dark:bg-slate-800/80` : base;
}

function splitPayload(form) {
  const employeeEditableData = {
    ...form,
    previous_companies: form.previous_companies,
    qualifications: form.qualifications,
    projects: form.projects,
    documents: form.documents
  };

  const hrManagedData = {};
  HR_MANAGED_FIELDS.forEach((key) => {
    hrManagedData[key] = form[key] ?? '';
    delete employeeEditableData[key];
  });

  delete employeeEditableData.onboarding_status;
  delete employeeEditableData.review_comment;
  delete employeeEditableData.reviewed_by;
  delete employeeEditableData.reviewed_at;
  delete employeeEditableData.submitted_at;

  return { employeeEditableData, hrManagedData };
}

function mergeData(employeeEditableData, hrManagedData, metadata) {
  return {
    ...defaultFormState(),
    ...(hrManagedData || {}),
    ...(employeeEditableData || {}),
    onboarding_status: metadata?.onboarding_status || 'draft',
    review_comment: metadata?.review_comment || '',
    reviewed_by: metadata?.reviewed_by || '',
    reviewed_at: metadata?.reviewed_at || '',
    submitted_at: metadata?.submitted_at || '',
    declaration_confirmed: Boolean(metadata?.declaration_confirmed),
    signature_consent: metadata?.signature_consent || ''
  };
}

export default function OnboardingPage() {
  const { user, profile } = useAuth();
  const [form, setForm] = useState(defaultFormState());
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingDocs, setUploadingDocs] = useState({});

  const isAdmin = profile?.role === 'admin';

  async function loadOnboarding() {
    setLoading(true);
    const { data, error } = await supabase
      .from('employee_onboarding')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (data) {
      setForm(
        mergeData(
          data.employee_editable_data,
          data.hr_managed_data,
          data
        )
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!user?.id) return;
    loadOnboarding();
  }, [user?.id]);

  const missingRequired = useMemo(() => {
    const missing = [];

    REQUIRED_EMPLOYEE_FIELDS.forEach((key) => {
      const value = form[key];
      if (!isNonEmpty(value) && key !== 'declaration_confirmed') {
        missing.push(key);
      }
    });

    if (!validateAadhaar(form.aadhaar_number)) {
      missing.push('Aadhaar Number format');
    }

    if (!validatePan(form.pan_number)) {
      missing.push('PAN Number format');
    }

    if (!validateIfsc(form.ifsc_code)) {
      missing.push('IFSC Code format');
    }

    if (!validateUpi(form.upi_id)) {
      missing.push('UPI ID format');
    }

    if (form.worked_before === 'Yes') {
      if (!form.previous_companies.length) {
        missing.push('At least one previous company');
      }
      form.previous_companies.forEach((item, index) => {
        if (!item.company_name || !item.designation || !item.duration || !item.last_drawn_salary || !item.reason_for_leaving) {
          missing.push(`Previous company #${index + 1}`);
        }
      });
    }

    form.qualifications.forEach((item, index) => {
      if (!item.qualification || !item.degree || !item.institution || !item.year_of_passing || !item.percentage_cgpa) {
        missing.push(`Qualification #${index + 1}`);
      }
    });

    form.projects.forEach((item, index) => {
      if (!item.project_name || !item.role || !item.technologies_used || !item.duration || !item.description) {
        missing.push(`Project #${index + 1}`);
      }
    });

    REQUIRED_DOCUMENT_FIELDS.forEach((key) => {
      if (!form.documents[key]) {
        missing.push(`Document: ${key}`);
      }
    });

    if (!form.declaration_confirmed) {
      missing.push('Declaration');
    }

    if (!isNonEmpty(form.signature_consent)) {
      missing.push('Signature / Digital Consent');
    }

    return missing;
  }, [form]);

  const setValue = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateArrayItem = (arrayKey, index, key, value) => {
    setForm((prev) => {
      const copy = [...prev[arrayKey]];
      copy[index] = { ...copy[index], [key]: value };
      return { ...prev, [arrayKey]: copy };
    });
  };

  const removeArrayItem = (arrayKey, index) => {
    setForm((prev) => ({
      ...prev,
      [arrayKey]: prev[arrayKey].filter((_, i) => i !== index)
    }));
  };

  const addArrayItem = (arrayKey, creator) => {
    setForm((prev) => ({
      ...prev,
      [arrayKey]: [...prev[arrayKey], creator()]
    }));
  };

  const getSignedDocumentUrl = async (path) => {
    const { data, error } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(path, 60);

    if (error) {
      toast.error(error.message);
      return null;
    }

    return data?.signedUrl || null;
  };

  const uploadDocument = async (docKey, file) => {
    const validation = validateOnboardingDocumentFile(file);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    setUploadingDocs((prev) => ({ ...prev, [docKey]: true }));

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const filePath = `${user.id}/${docKey}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, file, { upsert: true });

    setUploadingDocs((prev) => ({ ...prev, [docKey]: false }));

    if (error) {
      toast.error(error.message);
      return;
    }

    const existingPath = form.documents[docKey];
    if (existingPath) {
      await supabase.storage.from('employee-documents').remove([existingPath]);
    }

    setForm((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [docKey]: filePath
      }
    }));

    toast.success('Document uploaded');
  };

  const previewDocument = async (docKey) => {
    const path = form.documents[docKey];
    if (!path) {
      toast.error('No file uploaded yet.');
      return;
    }

    const signedUrl = await getSignedDocumentUrl(path);
    if (signedUrl) {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const removeDocument = async (docKey) => {
    const path = form.documents[docKey];
    if (!path) return;

    const { error } = await supabase.storage.from('employee-documents').remove([path]);
    if (error) {
      toast.error(error.message);
      return;
    }

    setForm((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [docKey]: ''
      }
    }));

    toast.success('Document removed');
  };

  const updateReviewStatus = async (status) => {
    if (!isAdmin) return;

    setReviewing(true);
    const payload = {
      user_id: user.id,
      employee_editable_data: splitPayload(form).employeeEditableData,
      hr_managed_data: splitPayload(form).hrManagedData,
      onboarding_status: status,
      review_comment: form.review_comment,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      declaration_confirmed: Boolean(form.declaration_confirmed),
      signature_consent: form.signature_consent,
      submitted_at: form.submitted_at || (status === 'submitted' ? new Date().toISOString() : null)
    };

    const { error } = await supabase
      .from('employee_onboarding')
      .upsert(payload, { onConflict: 'user_id' });

    setReviewing(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setForm((prev) => ({ ...prev, onboarding_status: status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }));
    toast.success(`Onboarding marked as ${status.replace('_', ' ')}.`);
  };

  const saveForm = async (e, mode = 'draft') => {
    if (e?.preventDefault) e.preventDefault();

    if (!isAdmin && mode === 'submit' && missingRequired.length > 0) {
      toast.error(`Please complete required fields (${missingRequired[0]}).`);
      return;
    }

    const { employeeEditableData, hrManagedData } = splitPayload(form);
    const nextStatus = isAdmin
      ? form.onboarding_status
      : mode === 'submit'
        ? 'submitted'
        : form.onboarding_status || 'draft';

    setSaving(true);
    const payload = {
      user_id: user.id,
      employee_editable_data: employeeEditableData,
      hr_managed_data: hrManagedData,
      onboarding_status: nextStatus,
      review_comment: form.review_comment,
      reviewed_by: form.reviewed_by || null,
      reviewed_at: form.reviewed_at || null,
      declaration_confirmed: Boolean(form.declaration_confirmed),
      signature_consent: form.signature_consent,
      submitted_at: mode === 'submit' ? new Date().toISOString() : form.submitted_at || null
    };

    const { error } = await supabase
      .from('employee_onboarding')
      .upsert(payload, { onConflict: 'user_id' });

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Onboarding information saved successfully.');
  };

  if (loading) {
    return <div className="card p-6 text-sm text-slate-500">Loading onboarding form...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink dark:text-white">Employee Onboarding</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Fill in your onboarding details carefully. Fields marked with * are mandatory.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_BADGE_STYLES[form.onboarding_status] || STATUS_BADGE_STYLES.draft}`}>
              {formatStatusLabel(form.onboarding_status)}
            </span>
            <span className="rounded-full border border-teal/20 bg-teal/5 px-3 py-1 text-xs font-semibold text-teal dark:bg-teal/10 dark:text-teal-300">
              {isAdmin ? 'HR managed + employee editable' : 'Employee editable form'}
            </span>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-teal/30 bg-teal/5 px-3 py-2 text-xs text-teal dark:bg-teal/10 dark:text-teal-300">
          Data is stored in separate payloads: employee editable fields and HR managed fields.
        </div>
      </div>

      <form className="space-y-6" onSubmit={saveForm}>
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">1. Personal Information</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass()} placeholder="First Name *" value={form.first_name} onChange={(e) => setValue('first_name', e.target.value)} />
            <input className={inputClass()} placeholder="Last Name *" value={form.last_name} onChange={(e) => setValue('last_name', e.target.value)} />
            <input className={inputClass()} type="date" value={form.date_of_birth} onChange={(e) => setValue('date_of_birth', e.target.value)} />
            <select className={inputClass()} value={form.gender} onChange={(e) => setValue('gender', e.target.value)}>
              <option value="">Gender *</option>
              {GENDER_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select className={inputClass()} value={form.blood_group} onChange={(e) => setValue('blood_group', e.target.value)}>
              <option value="">Blood Group *</option>
              {BLOOD_GROUP_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <input className={inputClass()} placeholder="Phone Number *" value={form.phone_number} onChange={(e) => setValue('phone_number', e.target.value)} />
            <input className={inputClass()} type="email" placeholder="Email Address *" value={form.email_address} onChange={(e) => setValue('email_address', e.target.value)} />
            <select className={inputClass()} value={form.marital_status} onChange={(e) => setValue('marital_status', e.target.value)}>
              <option value="">Marital Status</option>
              {MARITAL_STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">2. Identity (KYC) Details</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass()} placeholder="Aadhaar Number *" value={form.aadhaar_number} onChange={(e) => setValue('aadhaar_number', e.target.value)} />
            <input className={inputClass()} placeholder="PAN Number *" value={form.pan_number} onChange={(e) => setValue('pan_number', e.target.value)} />
            <input className={inputClass()} placeholder="Passport Number (optional)" value={form.passport_number} onChange={(e) => setValue('passport_number', e.target.value)} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">3. Family Details</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass()} placeholder="Father's Name *" value={form.father_name} onChange={(e) => setValue('father_name', e.target.value)} />
            <input className={inputClass()} placeholder="Mother's Name" value={form.mother_name} onChange={(e) => setValue('mother_name', e.target.value)} />
            <input className={inputClass()} placeholder="Spouse Name (if applicable)" value={form.spouse_name} onChange={(e) => setValue('spouse_name', e.target.value)} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">4. Emergency Contact</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass()} placeholder="Contact Name *" value={form.emergency_contact_name} onChange={(e) => setValue('emergency_contact_name', e.target.value)} />
            <input className={inputClass()} placeholder="Relationship *" value={form.emergency_contact_relationship} onChange={(e) => setValue('emergency_contact_relationship', e.target.value)} />
            <input className={inputClass()} placeholder="Phone Number *" value={form.emergency_contact_phone} onChange={(e) => setValue('emergency_contact_phone', e.target.value)} />
            <input className={inputClass()} placeholder="Alternate Phone Number" value={form.emergency_contact_alternate_phone} onChange={(e) => setValue('emergency_contact_alternate_phone', e.target.value)} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">5. Address Details</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea className={inputClass()} placeholder="Current Address *" value={form.current_address} onChange={(e) => setValue('current_address', e.target.value)} />
            <textarea className={inputClass()} placeholder="Permanent Address *" value={form.permanent_address} onChange={(e) => setValue('permanent_address', e.target.value)} />
            <input className={inputClass()} placeholder="City *" value={form.city} onChange={(e) => setValue('city', e.target.value)} />
            <input className={inputClass()} placeholder="State *" value={form.state} onChange={(e) => setValue('state', e.target.value)} />
            <input className={inputClass()} placeholder="Pincode *" value={form.pincode} onChange={(e) => setValue('pincode', e.target.value)} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">6. Bank and Salary Account Details</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass()} placeholder="Bank Name *" value={form.bank_name} onChange={(e) => setValue('bank_name', e.target.value)} />
            <input className={inputClass()} placeholder="Account Holder Name *" value={form.account_holder_name} onChange={(e) => setValue('account_holder_name', e.target.value)} />
            <input className={inputClass()} placeholder="Account Number *" value={form.account_number} onChange={(e) => setValue('account_number', e.target.value)} />
            <input className={inputClass()} placeholder="IFSC Code *" value={form.ifsc_code} onChange={(e) => setValue('ifsc_code', e.target.value)} />
            <input className={inputClass()} placeholder="Branch Name" value={form.branch_name} onChange={(e) => setValue('branch_name', e.target.value)} />
            <input className={inputClass()} placeholder="UPI ID *" value={form.upi_id} onChange={(e) => setValue('upi_id', e.target.value)} />
            <select className={inputClass()} value={form.salary_account} onChange={(e) => setValue('salary_account', e.target.value)}>
              <option value="">Is this a Salary Account? *</option>
              {YES_NO_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold">7. Employment Details (HR Managed)</h2>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">These fields are maintained by HR/admin and saved separately from employee editable fields.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Employee ID" value={form.employee_id} onChange={(e) => setValue('employee_id', e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p>
            </div>
            <div>
              <input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Department" value={form.department} onChange={(e) => setValue('department', e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p>
            </div>
            <div>
              <input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Designation *" value={form.designation} onChange={(e) => setValue('designation', e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p>
            </div>
            <div>
              <input className={inputClass(!isAdmin)} disabled={!isAdmin} type="date" value={form.date_of_joining} onChange={(e) => setValue('date_of_joining', e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p>
            </div>
            <div>
              <select className={inputClass(!isAdmin)} disabled={!isAdmin} value={form.employment_type} onChange={(e) => setValue('employment_type', e.target.value)}>
              <option value="">Employment Type *</option>
              {EMPLOYMENT_TYPE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p>
            </div>
            <div>
              <input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Work Location *" value={form.work_location} onChange={(e) => setValue('work_location', e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p>
            </div>
            <div>
              <input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Reporting Manager" value={form.reporting_manager} onChange={(e) => setValue('reporting_manager', e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p>
            </div>
          </div>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="text-lg font-semibold">8. Previous Employment Details</h2>
          <select className={inputClass()} value={form.worked_before} onChange={(e) => setValue('worked_before', e.target.value)}>
            <option value="">Have you worked before? *</option>
            {YES_NO_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>

          {form.worked_before === 'Yes' && (
            <div className="space-y-3">
              {form.previous_companies.map((item, index) => (
                <div key={`${item.company_name}-${index}`} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Company #{index + 1}</h3>
                    <button type="button" className="text-xs text-red-500" onClick={() => removeArrayItem('previous_companies', index)}>Remove</button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input className={inputClass()} placeholder="Company Name *" value={item.company_name} onChange={(e) => updateArrayItem('previous_companies', index, 'company_name', e.target.value)} />
                    <input className={inputClass()} placeholder="Designation *" value={item.designation} onChange={(e) => updateArrayItem('previous_companies', index, 'designation', e.target.value)} />
                    <input className={inputClass()} placeholder="Duration (From - To) *" value={item.duration} onChange={(e) => updateArrayItem('previous_companies', index, 'duration', e.target.value)} />
                    <input className={inputClass()} placeholder="Last Drawn Salary (CTC/LPA) *" value={item.last_drawn_salary} onChange={(e) => updateArrayItem('previous_companies', index, 'last_drawn_salary', e.target.value)} />
                    <textarea className={inputClass()} placeholder="Reason for Leaving *" value={item.reason_for_leaving} onChange={(e) => updateArrayItem('previous_companies', index, 'reason_for_leaving', e.target.value)} />
                  </div>
                </div>
              ))}
              <button type="button" className="btn-secondary" onClick={() => addArrayItem('previous_companies', emptyPreviousCompany)}>+ Add Another Company</button>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold">9. Salary and Compensation (HR Managed)</h2>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">These fields are admin editable only.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div><input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Offered CTC (LPA) *" value={form.offered_ctc_lpa} onChange={(e) => setValue('offered_ctc_lpa', e.target.value)} /><p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p></div>
            <div><input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Fixed Salary *" value={form.fixed_salary} onChange={(e) => setValue('fixed_salary', e.target.value)} /><p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p></div>
            <div><input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Variable Pay" value={form.variable_pay} onChange={(e) => setValue('variable_pay', e.target.value)} /><p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p></div>
            <div><input className={inputClass(!isAdmin)} disabled={!isAdmin} placeholder="Bonus" value={form.bonus} onChange={(e) => setValue('bonus', e.target.value)} /><p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p></div>
            <div><select className={inputClass(!isAdmin)} disabled={!isAdmin} value={form.pf_applicable} onChange={(e) => setValue('pf_applicable', e.target.value)}>
              <option value="">PF Applicable *</option>
              {YES_NO_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select><p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p></div>
            <div><select className={inputClass(!isAdmin)} disabled={!isAdmin} value={form.esi_applicable} onChange={(e) => setValue('esi_applicable', e.target.value)}>
              <option value="">ESI Applicable *</option>
              {YES_NO_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select><p className="mt-1 text-[11px] text-slate-400">Employee editable: No</p></div>
          </div>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="text-lg font-semibold">10. Education Details</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass()} placeholder="Highest Qualification *" value={form.highest_qualification} onChange={(e) => setValue('highest_qualification', e.target.value)} />
            <input className={inputClass()} placeholder="Degree *" value={form.degree} onChange={(e) => setValue('degree', e.target.value)} />
            <input className={inputClass()} placeholder="College/University *" value={form.college_university} onChange={(e) => setValue('college_university', e.target.value)} />
            <input className={inputClass()} placeholder="Year of Passing *" value={form.year_of_passing} onChange={(e) => setValue('year_of_passing', e.target.value)} />
            <input className={inputClass()} placeholder="Percentage / CGPA *" value={form.percentage_cgpa} onChange={(e) => setValue('percentage_cgpa', e.target.value)} />
          </div>

          {form.qualifications.map((item, index) => (
            <div key={`${item.institution}-${index}`} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Qualification #{index + 1}</h3>
                {form.qualifications.length > 1 ? (
                  <button type="button" className="text-xs text-red-500" onClick={() => removeArrayItem('qualifications', index)}>Remove</button>
                ) : null}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <input className={inputClass()} placeholder="Qualification *" value={item.qualification} onChange={(e) => updateArrayItem('qualifications', index, 'qualification', e.target.value)} />
                <input className={inputClass()} placeholder="Degree *" value={item.degree} onChange={(e) => updateArrayItem('qualifications', index, 'degree', e.target.value)} />
                <input className={inputClass()} placeholder="College/University *" value={item.institution} onChange={(e) => updateArrayItem('qualifications', index, 'institution', e.target.value)} />
                <input className={inputClass()} placeholder="Year of Passing *" value={item.year_of_passing} onChange={(e) => updateArrayItem('qualifications', index, 'year_of_passing', e.target.value)} />
                <input className={inputClass()} placeholder="Percentage / CGPA *" value={item.percentage_cgpa} onChange={(e) => updateArrayItem('qualifications', index, 'percentage_cgpa', e.target.value)} />
              </div>
            </div>
          ))}

          <button type="button" className="btn-secondary" onClick={() => addArrayItem('qualifications', emptyQualification)}>+ Add Another Qualification</button>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">11. Skills and Professional Details</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <input className={inputClass()} placeholder="Primary Skills *" value={form.primary_skills} onChange={(e) => setValue('primary_skills', normalizeCommaSeparated(e.target.value))} />
              <p className="mt-1 text-[11px] text-slate-400">Add skills separated by commas, for example: React, Node.js, SQL</p>
            </div>
            <div>
              <input className={inputClass()} placeholder="Secondary Skills" value={form.secondary_skills} onChange={(e) => setValue('secondary_skills', normalizeCommaSeparated(e.target.value))} />
              <p className="mt-1 text-[11px] text-slate-400">Optional, comma-separated list.</p>
            </div>
            <div>
              <input className={inputClass()} placeholder="Tools / Technologies Known *" value={form.tools_technologies} onChange={(e) => setValue('tools_technologies', normalizeCommaSeparated(e.target.value))} />
              <p className="mt-1 text-[11px] text-slate-400">Use commas to separate tools and technologies.</p>
            </div>
            <div>
              <input className={inputClass()} placeholder="Certifications" value={form.certifications} onChange={(e) => setValue('certifications', normalizeCommaSeparated(e.target.value))} />
              <p className="mt-1 text-[11px] text-slate-400">Optional, comma-separated list like AWS, PMP, Scrum Master.</p>
            </div>
          </div>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="text-lg font-semibold">12. Projects</h2>
          {form.projects.map((item, index) => (
            <div key={`${item.project_name}-${index}`} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Project #{index + 1}</h3>
                {form.projects.length > 1 ? (
                  <button type="button" className="text-xs text-red-500" onClick={() => removeArrayItem('projects', index)}>Remove</button>
                ) : null}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <input className={inputClass()} placeholder="Project Name *" value={item.project_name} onChange={(e) => updateArrayItem('projects', index, 'project_name', e.target.value)} />
                <input className={inputClass()} placeholder="Role *" value={item.role} onChange={(e) => updateArrayItem('projects', index, 'role', e.target.value)} />
                <input className={inputClass()} placeholder="Technologies Used *" value={item.technologies_used} onChange={(e) => updateArrayItem('projects', index, 'technologies_used', e.target.value)} />
                <input className={inputClass()} placeholder="Duration *" value={item.duration} onChange={(e) => updateArrayItem('projects', index, 'duration', e.target.value)} />
                <textarea className={inputClass()} placeholder="Description *" value={item.description} onChange={(e) => updateArrayItem('projects', index, 'description', e.target.value)} />
              </div>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => addArrayItem('projects', emptyProject)}>+ Add Another Project</button>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">13. Online Profiles</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass()} placeholder="LinkedIn Profile *" value={form.linkedin_profile} onChange={(e) => setValue('linkedin_profile', e.target.value)} />
            <input className={inputClass()} placeholder="GitHub Profile" value={form.github_profile} onChange={(e) => setValue('github_profile', e.target.value)} />
            <input className={inputClass()} placeholder="Portfolio / Personal Website" value={form.portfolio_website} onChange={(e) => setValue('portfolio_website', e.target.value)} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">14. Documents Upload</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Maximum upload size: 1MB per file.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['aadhaar_card', 'Upload Aadhaar Card *'],
              ['pan_card', 'Upload PAN Card *'],
              ['resume', 'Upload Resume *'],
              ['passport_photo', 'Upload Passport Size Photo *'],
              ['experience_letters', 'Upload Experience Letters (if applicable)'],
              ['previous_offer_letter', 'Upload Previous Offer Letter'],
              ['cancelled_cheque_or_bank_proof', 'Upload Cancelled Cheque / Bank Proof *']
            ].map(([key, label]) => (
              <div key={key} className="space-y-1 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</label>
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png"
                  className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void uploadDocument(key, file);
                    }
                  }}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button type="button" className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-600 transition hover:border-teal/40 hover:text-teal dark:border-slate-600 dark:text-slate-300" onClick={() => previewDocument(key)} disabled={!form.documents[key]}>
                    Preview
                  </button>
                  <button type="button" className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-600 transition hover:border-teal/40 hover:text-teal dark:border-slate-600 dark:text-slate-300" onClick={() => removeDocument(key)} disabled={!form.documents[key]}>
                    Remove
                  </button>
                  {uploadingDocs[key] ? <span className="text-teal">Uploading...</span> : null}
                </div>
                {form.documents[key] ? <p className="text-xs text-emerald-600">Uploaded. Upload a new file to replace it.</p> : <p className="text-xs text-slate-400">Not uploaded</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">15. Additional Information</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass()} placeholder="Notice Period *" value={form.notice_period} onChange={(e) => setValue('notice_period', e.target.value)} />
            <select className={inputClass()} value={form.willing_to_relocate} onChange={(e) => setValue('willing_to_relocate', e.target.value)}>
              <option value="">Willingness to Relocate *</option>
              {YES_NO_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">16. Declaration</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.declaration_confirmed}
              onChange={(e) => setValue('declaration_confirmed', e.target.checked)}
            />
            I confirm that all information provided is accurate and complete. *
          </label>
          <input
            className="field mt-3 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            placeholder="Signature / Digital Consent *"
            value={form.signature_consent}
            onChange={(e) => setValue('signature_consent', e.target.value)}
          />
        </section>

        {isAdmin && (
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold">Review and Status</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="form-label">Review Status</label>
                <select className={inputClass()} value={form.onboarding_status} onChange={(e) => setValue('onboarding_status', e.target.value)}>
                  {ONBOARDING_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatStatusLabel(status)}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Review Comment</label>
                <textarea className={inputClass()} value={form.review_comment} onChange={(e) => setValue('review_comment', e.target.value)} placeholder="Add feedback or approval note" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">Last reviewed: {form.reviewed_at ? new Date(form.reviewed_at).toLocaleString() : 'Not yet reviewed'}</p>
          </section>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {missingRequired.length > 0 ? `Missing required fields: ${missingRequired.length}` : 'All required employee fields completed.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <>
                <button type="button" className="btn-secondary" onClick={() => updateReviewStatus('under_review')} disabled={reviewing || saving}>Mark Under Review</button>
                <button type="button" className="btn-secondary" onClick={() => updateReviewStatus('needs_changes')} disabled={reviewing || saving}>Needs Changes</button>
                <button type="button" className="btn-secondary" onClick={() => updateReviewStatus('approved')} disabled={reviewing || saving}>Approve</button>
                <button type="button" className="btn-secondary" onClick={() => updateReviewStatus('rejected')} disabled={reviewing || saving}>Reject</button>
                <button type="button" className="btn-primary" onClick={() => saveForm(null, 'draft')} disabled={saving}>Save HR Updates</button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={() => saveForm(null, 'draft')} disabled={saving}>Save Draft</button>
                <button type="button" className="btn-primary" onClick={() => saveForm(null, 'submit')} disabled={saving}>
                  {saving ? 'Saving...' : 'Submit for Review'}
                </button>
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
