/**
 * Compile-time guarantee that the enums in `@hireflow/shared` (used by the web app, which cannot
 * import Prisma) match the Prisma enums exactly. If either side changes, `tsc` fails here.
 */
import type * as P from '@prisma/client';
import type * as S from '@hireflow/shared';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type EnumParity = [
  Assert<Same<P.UserRole, S.UserRole>>,
  Assert<Same<P.OrgRole, S.OrgRole>>,
  Assert<Same<P.JobStatus, S.JobStatus>>,
  Assert<Same<P.EmploymentType, S.EmploymentType>>,
  Assert<Same<P.ExperienceLevel, S.ExperienceLevel>>,
  Assert<Same<P.RemoteType, S.RemoteType>>,
  Assert<Same<P.EducationLevel, S.EducationLevel>>,
  Assert<Same<P.RequirementCategory, S.RequirementCategory>>,
  Assert<Same<P.ParsingStatus, S.ParsingStatus>>,
  Assert<Same<P.AnalysisStatus, S.AnalysisStatus>>,
  Assert<Same<P.ApplicationStatus, S.ApplicationStatus>>,
  Assert<Same<P.ApplicationSource, S.ApplicationSource>>,
  Assert<Same<P.SkillSource, S.SkillSource>>,
  Assert<Same<P.Proficiency, S.Proficiency>>,
  Assert<Same<P.InterviewType, S.InterviewType>>,
  Assert<Same<P.InterviewStatus, S.InterviewStatus>>,
  Assert<Same<P.QuestionCategory, S.QuestionCategory>>,
  Assert<Same<P.QuestionDifficulty, S.QuestionDifficulty>>,
  Assert<Same<P.AuditAction, S.AuditAction>>,
  Assert<Same<P.CopilotRole, S.CopilotRole>>,
];
