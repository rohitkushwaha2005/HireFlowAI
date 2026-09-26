import { PageHeader } from '@/components/common';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { AccountSettings } from '@/pages/recruiter/settings';

export default function CandidateSettingsPage() {
  useDocumentTitle('Settings');
  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and password." />
      <div className="max-w-3xl space-y-6">
        <AccountSettings />
      </div>
    </div>
  );
}
