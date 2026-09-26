import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, UserPlus } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  inviteMemberSchema,
  type InviteMemberInput,
  type MemberDto,
  type OrgRole,
} from '@hireflow/shared';
import { ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { ConfirmDialog, FormError, FormField } from '@/components/forms';
import { applyServerErrors } from '@/lib/form-errors';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import {
  useInviteMember,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from '@/features/api/misc';
import { useAuth } from '@/features/auth/use-auth';
import { RequirePermission } from '@/features/auth/guards';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate, initialsOf } from '@/lib/utils';

const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  RECRUITER: 'Recruiter',
  HIRING_MANAGER: 'Hiring manager',
};
const ASSIGNABLE = [
  { value: 'ADMIN', label: 'Admin — full access incl. team & settings' },
  { value: 'RECRUITER', label: 'Recruiter — jobs, candidates, pipeline' },
  { value: 'HIRING_MANAGER', label: 'Hiring manager — review & interviews' },
] as const;

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useInviteMember();
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', firstName: '', lastName: '', role: 'RECRUITER' },
  });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    try {
      await invite.mutateAsync(values);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      if (!applyServerErrors(error, form.setError))
        form.setError('root', {
          message: error instanceof Error ? error.message : 'Invitation failed',
        });
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They’ll get an email with a link to set their password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
          <div className="grid grid-cols-2 gap-3">
            <FormField id="firstName" label="First name" error={errors.firstName?.message}>
              <Input {...form.register('firstName')} />
            </FormField>
            <FormField id="lastName" label="Last name" error={errors.lastName?.message}>
              <Input {...form.register('lastName')} />
            </FormField>
          </div>
          <FormField id="email" label="Email" error={errors.email?.message}>
            <Input type="email" {...form.register('email')} />
          </FormField>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select
                  id="role"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ASSIGNABLE}
                />
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  useDocumentTitle('Team');
  const { can, me } = useAuth();
  const members = useMembers();
  const updateRole = useUpdateMemberRole();
  const remove = useRemoveMember();
  const [inviting, setInviting] = React.useState(false);
  const [removing, setRemoving] = React.useState<MemberDto | null>(null);
  const manage = can('team:manage');

  return (
    <div>
      <PageHeader
        title="Team"
        description="Manage who can access your hiring workspace and what they can do."
        actions={
          manage && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus /> Invite teammate
            </Button>
          )
        }
      />
      <RequirePermission permission="team:read">
        {members.isLoading ? (
          <ListSkeleton rows={3} />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => void members.refetch()} />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Joined</TableHead>
                  {manage && (
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data?.map((m) => {
                  const editable = manage && m.role !== 'OWNER' && m.userId !== me?.user.id;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={m.avatarUrl}
                            fallback={initialsOf(m.firstName, m.lastName)}
                            className="size-8"
                          />
                          <div>
                            <p className="font-medium">
                              {m.firstName} {m.lastName}{' '}
                              {m.userId === me?.user.id && (
                                <span className="text-xs text-muted-foreground">(you)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {m.email}{' '}
                              {!m.emailVerified && (
                                <Badge variant="muted" className="ml-1">
                                  Pending
                                </Badge>
                              )}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          <Select
                            aria-label={`Role for ${m.firstName} ${m.lastName}`}
                            className="w-44"
                            value={m.role}
                            onValueChange={(role) =>
                              updateRole.mutate({
                                id: m.id,
                                role: role as 'ADMIN' | 'RECRUITER' | 'HIRING_MANAGER',
                              })
                            }
                            options={ASSIGNABLE.map((a) => ({
                              value: a.value,
                              label: ROLE_LABELS[a.value],
                            }))}
                          />
                        ) : (
                          <Badge variant={m.role === 'OWNER' ? 'default' : 'secondary'}>
                            {ROLE_LABELS[m.role]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {formatDate(m.joinedAt)}
                      </TableCell>
                      {manage && (
                        <TableCell>
                          {editable && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setRemoving(m)}
                              aria-label={`Remove ${m.firstName} ${m.lastName}`}
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </RequirePermission>
      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.firstName ?? ''} ${removing?.lastName ?? ''}?`}
        description="They will immediately lose access to this organization. Their past activity stays in the audit log."
        confirmLabel="Remove"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          removing && remove.mutate(removing.id, { onSettled: () => setRemoving(null) })
        }
      />
    </div>
  );
}
