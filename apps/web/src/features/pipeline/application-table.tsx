import { useNavigate } from 'react-router';
import type { ApplicationListItemDto } from '@hireflow/shared';
import { ApplicationStatusBadge, ScoreBadge } from '@/components/domain';
import { Avatar, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatDate, formatYears, initialsOf } from '@/lib/utils';

/** Recruiter application list, ranked by match score when sorted that way. */
export function ApplicationTable({ items, showJob = true }: { items: ApplicationListItemDto[]; showJob?: boolean }) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Candidate</TableHead>
          {showJob && <TableHead className="hidden md:table-cell">Job</TableHead>}
          <TableHead className="text-center">Match</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead className="hidden lg:table-cell">Experience</TableHead>
          <TableHead className="hidden sm:table-cell">Applied</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((app) => (
          <TableRow key={app.id} className="cursor-pointer" onClick={() => navigate(`/app/applications/${app.id}`)}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar fallback={initialsOf(app.candidate.firstName, app.candidate.lastName)} className="size-8" />
                <div className="min-w-0">
                  <a
                    href={`/app/applications/${app.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/app/applications/${app.id}`);
                    }}
                    className="block truncate font-medium hover:text-primary"
                  >
                    {app.candidate.firstName} {app.candidate.lastName}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">{app.candidate.headline ?? app.candidate.email}</p>
                </div>
              </div>
            </TableCell>
            {showJob && <TableCell className="hidden text-muted-foreground md:table-cell">{app.job.title}</TableCell>}
            <TableCell className="text-center">
              <ScoreBadge score={app.overallScore} pending={app.matchStatus === 'PENDING'} />
            </TableCell>
            <TableCell>
              <ApplicationStatusBadge status={app.status} />
            </TableCell>
            <TableCell className="hidden text-muted-foreground lg:table-cell">{formatYears(app.candidate.totalExperience)}</TableCell>
            <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(app.appliedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
