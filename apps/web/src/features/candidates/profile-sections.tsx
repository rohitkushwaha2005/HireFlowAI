import {
  Award,
  Briefcase,
  ExternalLink,
  FolderGit2,
  GraduationCap,
  CodeXml,
  Globe,
  Link2,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react';
import { EDUCATION_LEVEL_LABELS, type CandidateProfileDto } from '@hireflow/shared';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatMonthYear, formatYears, safeHref } from '@/lib/utils';

function period(start: string | null, end: string | null, current = false) {
  return `${formatMonthYear(start)} – ${current ? 'Present' : end ? formatMonthYear(end) : '—'}`;
}

export function ContactLinks({ profile }: { profile: CandidateProfileDto }) {
  const links = [
    { href: profile.linkedinUrl, label: 'LinkedIn', icon: Link2 },
    { href: profile.githubUrl, label: 'GitHub', icon: CodeXml },
    { href: profile.portfolioUrl, label: 'Portfolio', icon: Globe },
  ]
    .map((l) => ({ ...l, href: safeHref(l.href) }))
    .filter((l) => l.href);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <a
        href={`mailto:${profile.email}`}
        className="flex items-center gap-1.5 hover:text-foreground"
      >
        <Mail className="size-4" /> {profile.email}
      </a>
      {profile.phone && (
        <span className="flex items-center gap-1.5">
          <Phone className="size-4" /> {profile.phone}
        </span>
      )}
      {profile.location && (
        <span className="flex items-center gap-1.5">
          <MapPin className="size-4" /> {profile.location}
        </span>
      )}
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <l.icon className="size-4" /> {l.label} <ExternalLink className="size-3" />
        </a>
      ))}
    </div>
  );
}

export function SkillsCard({ profile }: { profile: CandidateProfileDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent>
        {profile.skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills listed yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((s) => (
              <Badge key={s.id} variant="secondary">
                {s.skill}
                {s.yearsExperience ? (
                  <span className="text-muted-foreground">· {formatYears(s.yearsExperience)}</span>
                ) : null}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ExperienceCard({ profile }: { profile: CandidateProfileDto }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="size-4" /> Experience
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {formatYears(profile.totalExperience)} total
        </span>
      </CardHeader>
      <CardContent>
        {profile.experiences.length === 0 ? (
          <p className="text-sm text-muted-foreground">No experience listed.</p>
        ) : (
          <ol className="relative space-y-5 border-l pl-5">
            {profile.experiences.map((exp) => (
              <li key={exp.id} className="relative">
                <span
                  className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary"
                  aria-hidden
                />
                <p className="font-medium">{exp.title}</p>
                <p className="text-sm text-muted-foreground">
                  {exp.company} · {period(exp.startDate, exp.endDate, exp.current)}
                </p>
                {exp.description && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                    {exp.description
                      .split('\n')
                      .filter(Boolean)
                      .map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function EducationCard({ profile }: { profile: CandidateProfileDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="size-4" /> Education
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.education.length === 0 ? (
          <p className="text-sm text-muted-foreground">No education listed.</p>
        ) : (
          profile.education.map((edu) => (
            <div key={edu.id}>
              <p className="font-medium">
                {[edu.degree, edu.field].filter(Boolean).join(' in ') || edu.institution}
              </p>
              <p className="text-sm text-muted-foreground">
                {edu.institution} · {formatMonthYear(edu.endDate)}
                {edu.level && <> · {EDUCATION_LEVEL_LABELS[edu.level]}</>}
                {edu.grade && <> · {edu.grade}</>}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function ProjectsCard({ profile }: { profile: CandidateProfileDto }) {
  if (profile.projects.length === 0 && profile.certifications.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderGit2 className="size-4" /> Projects & certifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {profile.projects.map((p) => (
          <div key={p.id}>
            <p className="font-medium">
              {safeHref(p.url) ? (
                <a
                  href={safeHref(p.url)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="hover:text-primary"
                >
                  {p.name}
                </a>
              ) : (
                p.name
              )}
            </p>
            {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            {p.technologies.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.technologies.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
        {profile.certifications.length > 0 && (
          <ul className="space-y-1">
            {profile.certifications.map((c) => (
              <li key={c} className="flex items-center gap-2 text-sm">
                <Award className="size-4 text-primary" /> {c}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
