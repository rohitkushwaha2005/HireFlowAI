import { CircleQuestionMark, LoaderCircle, RefreshCw, ThumbsUp, TriangleAlert } from 'lucide-react';
import type { ApplicationDetailDto, MatchDto } from '@hireflow/shared';
import { AIDisclaimer } from '@/components/common';
import { RequirementStatusIcon, ScoreBar, ScoreRing, SkillChips } from '@/components/domain';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tooltip,
} from '@/components/ui';
import { useRecalculateMatch } from '@/features/api/applications';
import { Can } from '@/features/auth/guards';

const STATUS_TEXT = {
  MATCHED: 'Has it',
  PARTIAL: 'Fewer years than requested',
  RELATED: 'Related experience',
  MISSING: 'Not found',
} as const;

function Breakdown({ match }: { match: MatchDto }) {
  if (match.requirements.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Requirement breakdown</p>
      <ul className="divide-y rounded-lg border">
        {match.requirements.map((req) => (
          <li key={req.normalizedSkill} className="flex items-center gap-3 px-3 py-2 text-sm">
            <RequirementStatusIcon status={req.status} />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{req.skill}</span>
              {!req.required && (
                <span className="ml-1.5 text-xs text-muted-foreground">(preferred)</span>
              )}
              <span className="block text-xs text-muted-foreground">
                {STATUS_TEXT[req.status]}
                {req.viaSkill ? ` via ${req.viaSkill}` : ''}
                {req.candidateYears ? ` · ${req.candidateYears} yrs` : ''}
                {req.minimumYears ? ` (wants ${req.minimumYears}+)` : ''}
              </span>
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(req.credit * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchPanel({ application }: { application: ApplicationDetailDto }) {
  const recalc = useRecalculateMatch(application.id);
  const match = application.match;

  if (!match) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI match</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          {application.matchStatus === 'PENDING' ? (
            <>
              <LoaderCircle className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Parsing the resume and computing the match…
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No match score is available (the resume may have failed to parse).
              </p>
              <Can permission="matching:run">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => recalc.mutate()}
                  loading={recalc.isPending}
                >
                  <RefreshCw /> Try scoring
                </Button>
              </Can>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>AI match</CardTitle>
          <CardDescription>
            Deterministic, weighted scoring against this job’s requirements
          </CardDescription>
        </div>
        <Can permission="matching:run">
          <Tooltip content="Recalculate with the latest profile, requirements and weights">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => recalc.mutate()}
              loading={recalc.isPending}
              aria-label="Recalculate match"
            >
              {!recalc.isPending && <RefreshCw />}
            </Button>
          </Tooltip>
        </Can>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <ScoreRing score={match.overallScore} size={112} />
          <div className="w-full flex-1 space-y-3">
            <ScoreBar label="Skills" value={match.skillsScore} weight={match.weights.skills} />
            <ScoreBar
              label="Experience"
              value={match.experienceScore}
              weight={match.weights.experience}
            />
            <ScoreBar
              label="Education"
              value={match.educationScore}
              weight={match.weights.education}
            />
            <ScoreBar
              label="Semantic fit"
              value={match.semanticScore}
              weight={match.weights.semantic}
            />
          </div>
        </div>

        <section aria-labelledby="why-match" className="space-y-3 rounded-lg bg-muted/50 p-4">
          <h4 id="why-match" className="flex items-center gap-1.5 text-sm font-semibold">
            <CircleQuestionMark className="size-4 text-primary" /> Why this match?
          </h4>
          <p className="text-sm">{match.explanation}</p>
          {match.highlights.length > 0 && (
            <ul className="space-y-1.5">
              {match.highlights.map((h) => (
                <li key={h} className="flex gap-2 text-sm">
                  <ThumbsUp className="mt-0.5 size-4 shrink-0 text-success" /> {h}
                </li>
              ))}
            </ul>
          )}
          {match.concerns.length > 0 && (
            <ul className="space-y-1.5">
              {match.concerns.map((c) => (
                <li key={c} className="flex gap-2 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> {c}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Semantic fit compares the meaning of the candidate’s professional background with the
            job description using embeddings. Names, contact details and other personal attributes
            are never used.
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold">Matched skills</p>
            {match.matchedSkills.length ? (
              <SkillChips skills={match.matchedSkills} variant="success" />
            ) : (
              <p className="text-sm text-muted-foreground">None</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Missing skills</p>
            {match.missingSkills.length ? (
              <SkillChips skills={match.missingSkills} variant="destructive" />
            ) : (
              <p className="text-sm text-muted-foreground">None</p>
            )}
          </div>
        </div>
        <Breakdown match={match} />
        <AIDisclaimer compact />
      </CardContent>
    </Card>
  );
}
