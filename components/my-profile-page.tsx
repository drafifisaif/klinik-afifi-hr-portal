"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FileUploadField } from "@/components/file-upload-field";
import { FormSection } from "@/components/form-section";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { sanitizeFilename } from "@/lib/utils";

interface MyProfilePageProps {
  profile: Profile;
  staff: TableRow | null;
  branches: BranchOption[];
  role: UserRole;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function MyProfilePage({ profile, staff, branches, role }: MyProfilePageProps) {
  const router = useRouter();
  const supabase = createClient();
  const operationalBranchId = String(staff?.branch_id ?? profile.branch_id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [form, setForm] = useState({
    full_name: String(staff?.full_name ?? profile.full_name ?? ""),
    ic_no: String(staff?.ic_no ?? ""),
    phone: String(staff?.phone ?? ""),
    email: String(staff?.email ?? profile.email ?? ""),
    address: String(staff?.address ?? ""),
    emergency_contact_name: String(staff?.emergency_contact_name ?? ""),
    emergency_contact_phone: String(staff?.emergency_contact_phone ?? ""),
    branch_id: operationalBranchId,
    position: String(staff?.position ?? ""),
    department: String(staff?.department ?? ""),
    status: String(staff?.status ?? "active"),
    role: String(profile.role ?? "staff"),
  });
  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const canManageExtended = role === "hr" || role === "super_admin";
  const hasAvatar = Boolean(String(profile.avatar_url ?? "").trim());
  const hasBranchMismatch =
    canManageExtended &&
    String(staff?.branch_id ?? "").trim() &&
    String(profile.branch_id ?? "").trim() &&
    String(staff?.branch_id ?? "") !== String(profile.branch_id ?? "");

  useEffect(() => {
    if (!canManageExtended) {
      return;
    }

    setForm((current) => {
      const nextBranchId = String(staff?.branch_id ?? profile.branch_id ?? "");
      if (current.branch_id === nextBranchId) {
        return current;
      }

      return {
        ...current,
        branch_id: nextBranchId,
      };
    });
  }, [canManageExtended, profile.branch_id, staff?.branch_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    let avatarPath = String(profile.avatar_url ?? "") || null;

    if (avatarFile) {
      const safeName = sanitizeFilename(avatarFile.name);
      avatarPath = `profiles/${profile.id}/${new Date().toISOString().slice(0, 10)}-${safeName}`;

      const uploadResult = await supabase.storage.from("profile-pictures").upload(avatarPath, avatarFile, {
        upsert: true,
      });

      if (uploadResult.error) {
        setIsSubmitting(false);
        setMessage(uploadResult.error.message);
        return;
      }
    }

    const profilePayload = {
      full_name: form.full_name,
      email: form.email || null,
      role: canManageExtended ? form.role : profile.role,
      avatar_url: avatarPath,
    };

    const staffPayload = {
      profile_id: profile.id,
      full_name: form.full_name,
      ic_no: form.ic_no || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      branch_id: canManageExtended ? form.branch_id || null : operationalBranchId || null,
      position: canManageExtended ? form.position || null : staff?.position ?? null,
      department: canManageExtended ? form.department || null : staff?.department ?? null,
      status: canManageExtended ? form.status : staff?.status ?? "active",
    };

    const profileResult = await supabase.from("profiles").update(profilePayload).eq("id", profile.id);

    if (profileResult.error) {
      setIsSubmitting(false);
      setMessage(profileResult.error.message);
      return;
    }

    const hasLinkedStaff = Boolean(String(staff?.profile_id ?? "").trim() || String(staff?.id ?? "").trim());
    const staffQuery = hasLinkedStaff
      ? supabase.from("staff").update(staffPayload).eq("profile_id", profile.id).select("id").single()
      : supabase.from("staff").insert({
          ...staffPayload,
          date_joined: new Date().toISOString().slice(0, 10),
        }).select("id").single();

    const staffResult = await staffQuery;

    if (staffResult.error) {
      setIsSubmitting(false);
      setMessage(staffResult.error.message);
      return;
    }

    const savedStaffId = String((staffResult.data as { id?: string } | null)?.id ?? staff?.id ?? "").trim();

    if (canManageExtended && savedStaffId) {
      const syncResponse = await fetch("/api/staff/branch-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          staffId: savedStaffId,
          branchId: form.branch_id || null,
        }),
      });

      const syncResult = await syncResponse.json().catch(() => null);
      if (!syncResponse.ok) {
        setIsSubmitting(false);
        setMessage(String(syncResult?.error ?? "Branch sync failed."));
        return;
      }
    }

    setIsSubmitting(false);

    setMessage(avatarPath ? (hasLinkedStaff ? "My profile updated." : "Staff profile completed.") : "Profil disimpan, tetapi sila upload gambar profil untuk melengkapkan profil anda.");
    setAvatarFile(null);
    router.refresh();
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setPasswordMessage("Supabase is not configured.");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage("Password mesti sekurang-kurangnya 8 aksara.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage("Pengesahan password tidak sepadan.");
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordMessage(null);

    const { error: passwordError } = await supabase.auth.updateUser({
      password: passwordForm.newPassword,
    });

    setIsUpdatingPassword(false);

    if (passwordError) {
      setPasswordMessage(passwordError.message);
      return;
    }

    setPasswordForm({
      newPassword: "",
      confirmPassword: "",
    });
    setPasswordMessage("Password berjaya dikemas kini.");
  }

  return (
    <div className="space-y-6">
      {!staff ? (
        <EmptyState
          title="Complete Staff Profile"
          description="Your account exists, but your linked staff row is still missing. Complete the form below to activate HR workflows like leave, MC, and compliance uploads."
        />
      ) : null}

      <FormSection
        title={staff ? "My Profile" : "Complete Staff Profile"}
        description="You can update your personal staff information here. Branch, role, and organizational fields remain controlled by HR unless your role allows more access."
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          {hasBranchMismatch ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              Branch mismatch detected between staff and profile. Saving this record will sync the profile branch to the staff branch source.
            </div>
          ) : null}
          {!hasAvatar && !avatarFile ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              Sila upload gambar profil untuk melengkapkan profil anda.
            </div>
          ) : null}

          <FileUploadField
            label="Profile Picture"
            file={avatarFile}
            storedPath={String(profile.avatar_url ?? "") || null}
            helperText="Upload your latest profile photo to the private `profile-pictures` bucket."
            onChange={setAvatarFile}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Full name" className={inputClass} required />
            <input value={form.ic_no} onChange={(event) => setForm((current) => ({ ...current, ic_no: event.target.value }))} placeholder="IC number" className={inputClass} />
            <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className={inputClass} />
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className={inputClass} />
            <input value={form.emergency_contact_name} onChange={(event) => setForm((current) => ({ ...current, emergency_contact_name: event.target.value }))} placeholder="Emergency contact name" className={inputClass} />
            <input value={form.emergency_contact_phone} onChange={(event) => setForm((current) => ({ ...current, emergency_contact_phone: event.target.value }))} placeholder="Emergency contact phone" className={inputClass} />
          </div>
          <textarea value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" rows={4} className={textareaClass} />

          {canManageExtended ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))} className={inputClass}>
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <input value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} placeholder="Position" className={inputClass} />
              <input value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} placeholder="Department" className={inputClass} />
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={inputClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="resigned">Resigned</option>
              </select>
              <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className={inputClass}>
                {[
                  "staff",
                  "branch_pic",
                  "operation",
                  "hr",
                  "super_admin",
                ].map((roleName) => (
                  <option key={roleName} value={roleName}>{roleName.replaceAll("_", " ")}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">Branch: {branches.find((branch) => branch.id === operationalBranchId)?.name ?? "Not set"}</div>
              <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">Position: {String(staff?.position ?? "Not set")}</div>
              <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">Department: {String(staff?.department ?? "Not set")}</div>
              <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">Status: {String(staff?.status ?? "active")}</div>
            </div>
          )}

          {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
          <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
            {staff ? <Save className="h-4 w-4" /> : <UserRoundPlus className="h-4 w-4" />}
            {isSubmitting ? "Saving..." : staff ? "Update my profile" : "Complete profile"}
          </button>
        </form>
      </FormSection>

      <FormSection
        title="Change Password"
        description="Gunakan password yang kuat dan jangan kongsi akaun dengan staff lain."
      >
        <form className="space-y-5" onSubmit={handlePasswordSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">New Password</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                placeholder="Minimum 8 characters"
                className={inputClass}
                minLength={8}
                required
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">Confirm New Password</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Repeat your new password"
                className={inputClass}
                minLength={8}
                required
              />
            </label>
          </div>

          {passwordMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{passwordMessage}</p> : null}

          <button
            type="submit"
            disabled={isUpdatingPassword}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70 sm:w-auto"
          >
            <Save className="h-4 w-4" />
            {isUpdatingPassword ? "Updating..." : "Update Password"}
          </button>
        </form>
      </FormSection>
    </div>
  );
}
