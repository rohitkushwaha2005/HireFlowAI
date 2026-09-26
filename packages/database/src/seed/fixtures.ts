/**
 * Demo data for local development. Every person, company and school below is fictional; emails
 * use the reserved `demo.hireflow.local` domain. Nothing here is used in production.
 */
import type {
  ApplicationStatus,
  EducationLevel,
  EmploymentType,
  ExperienceLevel,
  RemoteType,
  RequirementCategory,
} from '@hireflow/shared';

export const DEMO_EMAIL_DOMAIN = 'demo.hireflow.local';
/** Development-only password for every demo account. Never use in production. */
export const DEFAULT_DEMO_PASSWORD = 'HireFlowDemo!2026';

export const DEMO_ORGANIZATION = { name: 'TechNova Labs', slug: 'technova-labs' };

export interface StaffFixture {
  key: 'owner' | 'recruiter2' | 'manager';
  email: string;
  firstName: string;
  lastName: string;
  globalRole: 'RECRUITER' | 'HIRING_MANAGER';
  orgRole: 'OWNER' | 'RECRUITER' | 'HIRING_MANAGER';
}

export const STAFF: StaffFixture[] = [
  {
    key: 'owner',
    email: `recruiter@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Riley',
    lastName: 'Morgan',
    globalRole: 'RECRUITER',
    orgRole: 'OWNER',
  },
  {
    key: 'recruiter2',
    email: `casey.nguyen@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Casey',
    lastName: 'Nguyen',
    globalRole: 'RECRUITER',
    orgRole: 'RECRUITER',
  },
  {
    key: 'manager',
    email: `hiring.manager@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Taylor',
    lastName: 'Brooks',
    globalRole: 'HIRING_MANAGER',
    orgRole: 'HIRING_MANAGER',
  },
];

export type JobKey = 'frontend' | 'backend' | 'fullstack' | 'ai' | 'devops' | 'analyst';

export interface RequirementFixture {
  skill: string;
  category: RequirementCategory;
  required: boolean;
  weight: number;
  minimumYears?: number;
}

export interface JobFixture {
  key: JobKey;
  title: string;
  status: 'PUBLISHED' | 'DRAFT' | 'CLOSED';
  publishedDaysAgo: number | null;
  location: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  salaryMin: number;
  salaryMax: number;
  minYearsExperience: number | null;
  educationLevel: EducationLevel | null;
  description: string;
  responsibilities: string[];
  requirements: RequirementFixture[];
}

export const JOBS: JobFixture[] = [
  {
    key: 'frontend',
    title: 'Senior Frontend Engineer',
    status: 'PUBLISHED',
    publishedDaysAgo: 38,
    location: 'Remote (US & Canada)',
    remoteType: 'REMOTE',
    employmentType: 'FULL_TIME',
    experienceLevel: 'SENIOR',
    salaryMin: 140000,
    salaryMax: 175000,
    minYearsExperience: 4,
    educationLevel: null,
    description: `TechNova Labs builds collaboration software used by thousands of product teams. We are looking for a Senior Frontend Engineer to own the experience of our core web application.

You will work with designers and backend engineers to ship fast, accessible interfaces in React and TypeScript, and help evolve our design system.

Requirements:
- 4+ years of professional frontend development
- Expert knowledge of React and TypeScript
- Strong CSS skills and experience with Next.js
- A track record of building accessible (WCAG) interfaces

Nice to have:
- GraphQL
- Automated testing with Jest or Playwright
- Experience working closely with designers in Figma`,
    responsibilities: [
      'Build and maintain product features in React and TypeScript',
      'Evolve the shared component library and design system',
      'Champion accessibility and web performance',
      'Mentor engineers through code review and pairing',
    ],
    requirements: [
      { skill: 'React', category: 'FRAMEWORK', required: true, weight: 5, minimumYears: 4 },
      { skill: 'TypeScript', category: 'LANGUAGE', required: true, weight: 5, minimumYears: 3 },
      { skill: 'CSS', category: 'LANGUAGE', required: true, weight: 3 },
      { skill: 'Next.js', category: 'FRAMEWORK', required: true, weight: 3 },
      { skill: 'Accessibility', category: 'CONCEPT', required: true, weight: 3 },
      { skill: 'GraphQL', category: 'CONCEPT', required: false, weight: 2 },
      { skill: 'Jest', category: 'TOOL', required: false, weight: 2 },
      { skill: 'Figma', category: 'TOOL', required: false, weight: 1 },
    ],
  },
  {
    key: 'backend',
    title: 'Backend Engineer',
    status: 'PUBLISHED',
    publishedDaysAgo: 35,
    location: 'Austin, TX',
    remoteType: 'HYBRID',
    employmentType: 'FULL_TIME',
    experienceLevel: 'MID',
    salaryMin: 125000,
    salaryMax: 160000,
    minYearsExperience: 3,
    educationLevel: 'BACHELOR',
    description: `Our platform team builds the APIs and data pipelines behind TechNova's products. As a Backend Engineer you will design services in Node.js and TypeScript, backed by PostgreSQL and Redis, running on AWS.

Requirements:
- 3+ years building production backend services
- Node.js and TypeScript
- PostgreSQL data modelling and query optimization
- Redis, Docker and AWS in production
- Bachelor's degree in Computer Science or equivalent practical experience

Nice to have:
- Kafka or other event streaming platforms
- Microservices architecture`,
    responsibilities: [
      'Design and operate REST APIs and background workers',
      'Model data and optimize PostgreSQL queries',
      'Improve reliability, observability and performance of services',
      'Participate in on-call rotation and incident reviews',
    ],
    requirements: [
      { skill: 'Node.js', category: 'FRAMEWORK', required: true, weight: 5, minimumYears: 3 },
      { skill: 'TypeScript', category: 'LANGUAGE', required: true, weight: 4 },
      { skill: 'PostgreSQL', category: 'DATABASE', required: true, weight: 5 },
      { skill: 'Redis', category: 'DATABASE', required: true, weight: 3 },
      { skill: 'Docker', category: 'DEVOPS', required: true, weight: 3 },
      { skill: 'AWS', category: 'CLOUD', required: true, weight: 3 },
      { skill: 'Kafka', category: 'TOOL', required: false, weight: 2 },
      { skill: 'Microservices', category: 'CONCEPT', required: false, weight: 2 },
    ],
  },
  {
    key: 'fullstack',
    title: 'Full Stack Engineer',
    status: 'PUBLISHED',
    publishedDaysAgo: 30,
    location: 'Remote (Global)',
    remoteType: 'REMOTE',
    employmentType: 'FULL_TIME',
    experienceLevel: 'MID',
    salaryMin: 120000,
    salaryMax: 150000,
    minYearsExperience: 3,
    educationLevel: 'BACHELOR',
    description: `Join the team building TechNova Live, our real-time collaboration product. You will work across the stack: React and TypeScript on the frontend, Node.js services and PostgreSQL on the backend, and WebSockets in between.

Requirements:
- 3+ years of full stack development experience
- React, TypeScript and Node.js
- PostgreSQL and REST API design
- Bachelor's degree in a technical field or equivalent experience

Nice to have:
- Real-time applications with WebSockets
- AWS and Docker`,
    responsibilities: [
      'Ship end-to-end features across React frontends and Node.js services',
      'Build real-time collaboration features over WebSockets',
      'Design APIs and database schemas',
      'Write automated tests and improve developer tooling',
    ],
    requirements: [
      { skill: 'React', category: 'FRAMEWORK', required: true, weight: 5 },
      { skill: 'Node.js', category: 'FRAMEWORK', required: true, weight: 5 },
      { skill: 'TypeScript', category: 'LANGUAGE', required: true, weight: 4 },
      { skill: 'PostgreSQL', category: 'DATABASE', required: true, weight: 4 },
      { skill: 'REST APIs', category: 'CONCEPT', required: true, weight: 3 },
      { skill: 'WebSockets', category: 'CONCEPT', required: false, weight: 2 },
      { skill: 'AWS', category: 'CLOUD', required: false, weight: 2 },
      { skill: 'Docker', category: 'DEVOPS', required: false, weight: 2 },
    ],
  },
  {
    key: 'ai',
    title: 'AI Engineer',
    status: 'PUBLISHED',
    publishedDaysAgo: 21,
    location: 'San Francisco, CA',
    remoteType: 'HYBRID',
    employmentType: 'FULL_TIME',
    experienceLevel: 'SENIOR',
    salaryMin: 170000,
    salaryMax: 210000,
    minYearsExperience: 3,
    educationLevel: 'BACHELOR',
    description: `We are adding AI assistance to every TechNova product. As an AI Engineer you will build retrieval-augmented generation systems, evaluation pipelines and production LLM services.

Requirements:
- 3+ years of Python in production
- Hands-on experience building with LLMs and RAG
- Vector databases and embeddings
- PyTorch or a comparable deep learning framework
- FastAPI or similar for serving models

Nice to have:
- MLOps tooling and model monitoring
- AWS`,
    responsibilities: [
      'Design and ship RAG pipelines over product data',
      'Build evaluation suites for LLM features',
      'Serve models and AI services with low latency',
      'Partner with product teams to scope AI features responsibly',
    ],
    requirements: [
      { skill: 'Python', category: 'LANGUAGE', required: true, weight: 5, minimumYears: 3 },
      { skill: 'LLMs', category: 'AI_ML', required: true, weight: 5 },
      { skill: 'RAG', category: 'AI_ML', required: true, weight: 4 },
      { skill: 'Vector databases', category: 'AI_ML', required: true, weight: 3 },
      { skill: 'PyTorch', category: 'AI_ML', required: true, weight: 3 },
      { skill: 'FastAPI', category: 'FRAMEWORK', required: true, weight: 3 },
      { skill: 'MLOps', category: 'AI_ML', required: false, weight: 2 },
      { skill: 'AWS', category: 'CLOUD', required: false, weight: 2 },
    ],
  },
  {
    key: 'devops',
    title: 'DevOps Engineer',
    status: 'DRAFT',
    publishedDaysAgo: null,
    location: 'Austin, TX',
    remoteType: 'HYBRID',
    employmentType: 'FULL_TIME',
    experienceLevel: 'MID',
    salaryMin: 130000,
    salaryMax: 165000,
    minYearsExperience: 3,
    educationLevel: null,
    description: `We are looking for a DevOps Engineer to scale our infrastructure on AWS using Kubernetes and Terraform, and to improve CI/CD and observability across teams.

Requirements:
- Kubernetes and Terraform in production
- AWS
- CI/CD pipelines
- Linux administration

Nice to have:
- Observability with Prometheus and Grafana`,
    responsibilities: [
      'Operate Kubernetes clusters',
      'Codify infrastructure with Terraform',
      'Own CI/CD pipelines',
    ],
    requirements: [
      { skill: 'Kubernetes', category: 'DEVOPS', required: true, weight: 5 },
      { skill: 'Terraform', category: 'DEVOPS', required: true, weight: 4 },
      { skill: 'AWS', category: 'CLOUD', required: true, weight: 4 },
      { skill: 'CI/CD', category: 'DEVOPS', required: true, weight: 3 },
      { skill: 'Linux', category: 'DEVOPS', required: true, weight: 3 },
      { skill: 'Observability', category: 'DEVOPS', required: false, weight: 2 },
    ],
  },
  {
    key: 'analyst',
    title: 'Data Analyst',
    status: 'CLOSED',
    publishedDaysAgo: 75,
    location: 'Remote (US)',
    remoteType: 'REMOTE',
    employmentType: 'FULL_TIME',
    experienceLevel: 'JUNIOR',
    salaryMin: 85000,
    salaryMax: 105000,
    minYearsExperience: 1,
    educationLevel: 'BACHELOR',
    description: `Help teams at TechNova make decisions with data. You will build dashboards and analyses with SQL and Python and maintain dbt models in Snowflake.

Requirements:
- SQL and Python (pandas)
- 1+ years in an analytics role
- Bachelor's degree

Nice to have:
- dbt and Snowflake`,
    responsibilities: [
      'Build dashboards and self-serve datasets',
      'Answer product questions with data',
      'Maintain dbt models',
    ],
    requirements: [
      { skill: 'SQL', category: 'LANGUAGE', required: true, weight: 5 },
      { skill: 'Python', category: 'LANGUAGE', required: true, weight: 4 },
      { skill: 'pandas', category: 'AI_ML', required: true, weight: 3 },
      { skill: 'dbt', category: 'TOOL', required: false, weight: 2 },
      { skill: 'Snowflake', category: 'DATABASE', required: false, weight: 2 },
    ],
  },
];

export interface ExperienceFixture {
  title: string;
  company: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface CandidateFixture {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  links: string[];
  skills: Array<{ label: string; items: string[] }>;
  experience: ExperienceFixture[];
  education: Array<{
    degree: string;
    institution: string;
    start: string;
    end: string;
    grade?: string;
  }>;
  projects: Array<{ name: string; description: string }>;
  certifications: string[];
  applications: Array<{
    job: JobKey;
    status: ApplicationStatus;
    daysAgo: number;
    coverLetter?: string;
  }>;
}

const email = (first: string, last: string) =>
  `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${DEMO_EMAIL_DOMAIN}`;

export const CANDIDATES: CandidateFixture[] = [
  {
    firstName: 'Jordan',
    lastName: 'Rivera',
    email: `candidate@${DEMO_EMAIL_DOMAIN}`,
    phone: '+1 555 010 0101',
    location: 'Denver, CO',
    headline: 'Full Stack Developer',
    summary:
      'Full stack developer with 4+ years building web products in React, TypeScript and Node.js. Enjoys owning features end to end, from database schema to polished UI.',
    links: ['linkedin.com/in/jordan-rivera-demo', 'github.com/jordan-rivera-demo'],
    skills: [
      { label: 'Languages', items: ['TypeScript', 'JavaScript', 'SQL', 'HTML', 'CSS'] },
      { label: 'Frameworks', items: ['React', 'Node.js', 'Express', 'Next.js'] },
      { label: 'Data & Cloud', items: ['PostgreSQL', 'Redis', 'Docker', 'AWS'] },
    ],
    experience: [
      {
        title: 'Full Stack Developer',
        company: 'Brightwave Analytics',
        start: 'Mar 2023',
        end: 'Present',
        bullets: [
          'Built customer-facing reporting dashboards in React and TypeScript used by 3,000 accounts',
          'Designed REST APIs in Node.js and Express backed by PostgreSQL, cutting p95 latency by 40%',
          'Containerized services with Docker and deployed them to AWS ECS',
        ],
      },
      {
        title: 'Software Developer',
        company: 'Cobalt Commerce',
        start: 'Jun 2021',
        end: 'Feb 2023',
        bullets: [
          'Developed checkout features in React and Redux',
          'Added Redis caching to the product catalog service built with Node.js',
        ],
      },
    ],
    education: [
      {
        degree: 'B.S. in Computer Science',
        institution: 'Lakeside State University',
        start: '2017',
        end: '2021',
        grade: 'GPA 3.6/4.0',
      },
    ],
    projects: [
      {
        name: 'TaskPulse',
        description: 'Kanban board with live updates using React, Node.js and WebSockets',
      },
    ],
    certifications: ['AWS Certified Cloud Practitioner'],
    applications: [{ job: 'frontend', status: 'SCREENING', daysAgo: 9 }],
  },
  {
    firstName: 'Priya',
    lastName: 'Raman',
    email: email('Priya', 'Raman'),
    phone: '+1 555 010 0102',
    location: 'Toronto, ON',
    headline: 'Senior Frontend Engineer',
    summary:
      'Frontend engineer with 7 years of experience building accessible, high-performance React applications and design systems.',
    links: ['linkedin.com/in/priya-raman-demo', 'priyaraman.dev'],
    skills: [
      {
        label: 'Frontend',
        items: ['React', 'TypeScript', 'Next.js', 'Redux', 'CSS', 'Tailwind CSS', 'GraphQL'],
      },
      { label: 'Quality', items: ['Accessibility', 'Jest', 'Playwright'] },
      { label: 'Tools', items: ['Figma', 'Vite', 'Git'] },
    ],
    experience: [
      {
        title: 'Senior Frontend Engineer',
        company: 'Lumen Health',
        start: 'Jan 2022',
        end: 'Present',
        bullets: [
          'Led the migration of a patient portal to Next.js and TypeScript, improving Lighthouse performance from 58 to 94',
          'Created a React component library with WCAG 2.1 AA accessibility and automated Jest and Playwright tests',
          'Introduced GraphQL on the client with typed hooks',
        ],
      },
      {
        title: 'Frontend Engineer',
        company: 'Orbital Media',
        start: 'Aug 2019',
        end: 'Dec 2021',
        bullets: [
          'Built editorial tools in React and Redux',
          'Partnered with designers in Figma to ship a new design system',
        ],
      },
      {
        title: 'Web Developer',
        company: 'Pixelcraft Studio',
        start: 'Jun 2018',
        end: 'Jul 2019',
        bullets: ['Developed marketing sites with HTML, CSS and JavaScript'],
      },
    ],
    education: [
      {
        degree: 'B.Eng. in Software Engineering',
        institution: 'Northbridge University',
        start: '2014',
        end: '2018',
      },
    ],
    projects: [
      {
        name: 'a11y-lint-kit',
        description: 'Open-source ESLint rules for accessible React components',
      },
    ],
    certifications: [],
    applications: [
      { job: 'frontend', status: 'INTERVIEW', daysAgo: 30 },
      { job: 'fullstack', status: 'APPLIED', daysAgo: 4 },
    ],
  },
  {
    firstName: 'Marcus',
    lastName: 'Bell',
    email: email('Marcus', 'Bell'),
    phone: '+1 555 010 0103',
    location: 'Atlanta, GA',
    headline: 'Frontend Developer',
    summary:
      'Frontend developer focused on responsive interfaces and clean CSS, with 2 years of React experience.',
    links: ['github.com/marcus-bell-demo'],
    skills: [{ label: 'Skills', items: ['JavaScript', 'React', 'HTML', 'CSS', 'Sass', 'Figma'] }],
    experience: [
      {
        title: 'Frontend Developer',
        company: 'Greenleaf Digital',
        start: 'May 2024',
        end: 'Present',
        bullets: [
          'Build landing pages and dashboards in React and Sass',
          'Translate Figma designs into responsive layouts',
        ],
      },
    ],
    education: [
      {
        degree: 'Associate Degree in Web Development',
        institution: 'Metro Community College',
        start: '2021',
        end: '2023',
      },
    ],
    projects: [
      {
        name: 'Recipe Finder',
        description: 'React single-page app consuming a public recipes API',
      },
    ],
    certifications: [],
    applications: [{ job: 'frontend', status: 'REJECTED', daysAgo: 33 }],
  },
  {
    firstName: 'Elena',
    lastName: 'Petrova',
    email: email('Elena', 'Petrova'),
    phone: '+1 555 010 0104',
    location: 'Chicago, IL',
    headline: 'UI Engineer',
    summary:
      'UI engineer with 5 years of experience in Vue.js and TypeScript, passionate about accessibility and testing.',
    links: ['linkedin.com/in/elena-petrova-demo'],
    skills: [
      {
        label: 'Skills',
        items: ['Vue.js', 'TypeScript', 'JavaScript', 'CSS', 'Accessibility', 'Cypress', 'React'],
      },
    ],
    experience: [
      {
        title: 'UI Engineer',
        company: 'Harborline Logistics',
        start: 'Feb 2021',
        end: 'Present',
        bullets: [
          'Own the shipment tracking UI built with Vue.js and TypeScript',
          'Established Cypress end-to-end tests and accessibility audits',
          'Prototyped a React micro-frontend for the carrier portal',
        ],
      },
      {
        title: 'Frontend Developer',
        company: 'Sparrow Apps',
        start: 'Jan 2020',
        end: 'Jan 2021',
        bullets: ['Built product pages with JavaScript and CSS'],
      },
    ],
    education: [
      {
        degree: 'B.A. in Interaction Design',
        institution: 'Riverton Institute of Technology',
        start: '2015',
        end: '2019',
      },
    ],
    projects: [],
    certifications: ['IAAP Web Accessibility Specialist'],
    applications: [{ job: 'frontend', status: 'SHORTLISTED', daysAgo: 22 }],
  },
  {
    firstName: 'Kenji',
    lastName: 'Watanabe',
    email: email('Kenji', 'Watanabe'),
    phone: '+1 555 010 0105',
    location: 'Austin, TX',
    headline: 'Senior Backend Engineer',
    summary:
      'Backend engineer with 6 years designing scalable Node.js services, event-driven systems and PostgreSQL data models on AWS.',
    links: ['github.com/kenji-watanabe-demo'],
    skills: [
      {
        label: 'Backend',
        items: ['Node.js', 'TypeScript', 'Express', 'NestJS', 'Microservices', 'REST APIs'],
      },
      { label: 'Data', items: ['PostgreSQL', 'Redis', 'Kafka'] },
      { label: 'Infrastructure', items: ['AWS', 'Docker', 'Terraform'] },
    ],
    experience: [
      {
        title: 'Senior Backend Engineer',
        company: 'Quantix Payments',
        start: 'Apr 2021',
        end: 'Present',
        bullets: [
          'Designed event-driven payment services in Node.js and TypeScript using Kafka',
          'Scaled PostgreSQL to 2 billion rows with partitioning and query optimization',
          'Introduced Redis-based rate limiting and idempotency for public APIs on AWS',
        ],
      },
      {
        title: 'Backend Engineer',
        company: 'Cobalt Commerce',
        start: 'Jul 2019',
        end: 'Mar 2021',
        bullets: ['Built order management microservices with NestJS and Docker'],
      },
      {
        title: 'Software Engineer',
        company: 'Fieldstone Labs',
        start: 'Aug 2018',
        end: 'Jun 2019',
        bullets: ['Maintained Express REST APIs and PostgreSQL schemas'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Computer Engineering',
        institution: 'Lakeside State University',
        start: '2014',
        end: '2018',
      },
    ],
    projects: [],
    certifications: ['AWS Certified Developer – Associate'],
    applications: [{ job: 'backend', status: 'OFFER', daysAgo: 32 }],
  },
  {
    firstName: 'Aisha',
    lastName: 'Okafor',
    email: email('Aisha', 'Okafor'),
    phone: '+1 555 010 0106',
    location: 'Houston, TX',
    headline: 'Software Engineer',
    summary:
      'Software engineer with 3 years of experience building Java and Spring Boot services on Kubernetes.',
    links: ['linkedin.com/in/aisha-okafor-demo'],
    skills: [
      {
        label: 'Skills',
        items: ['Java', 'Spring Boot', 'MySQL', 'Docker', 'Kubernetes', 'REST APIs'],
      },
    ],
    experience: [
      {
        title: 'Software Engineer',
        company: 'Meridian Insurance Tech',
        start: 'Aug 2022',
        end: 'Present',
        bullets: [
          'Develop claims processing services in Java and Spring Boot',
          'Deploy services to Kubernetes with Docker',
        ],
      },
      {
        title: 'Software Engineering Intern',
        company: 'Meridian Insurance Tech',
        start: 'May 2021',
        end: 'Aug 2021',
        bullets: ['Built internal tooling with MySQL and Java'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Computer Science',
        institution: 'Southgate University',
        start: '2018',
        end: '2022',
      },
    ],
    projects: [],
    certifications: [],
    applications: [{ job: 'backend', status: 'SCREENING', daysAgo: 12 }],
  },
  {
    firstName: 'Daniel',
    lastName: 'Kim',
    email: email('Daniel', 'Kim'),
    phone: '+1 555 010 0107',
    location: 'Seattle, WA',
    headline: 'Staff Backend Engineer',
    summary:
      'Backend engineer with 8 years building distributed systems in Go and PostgreSQL on Kubernetes and AWS.',
    links: ['github.com/daniel-kim-demo'],
    skills: [
      { label: 'Languages', items: ['Go', 'Python', 'SQL'] },
      {
        label: 'Systems',
        items: [
          'PostgreSQL',
          'gRPC',
          'Kubernetes',
          'AWS',
          'Terraform',
          'Distributed systems',
          'Redis',
        ],
      },
    ],
    experience: [
      {
        title: 'Staff Backend Engineer',
        company: 'Northpeak Systems',
        start: 'Mar 2020',
        end: 'Present',
        bullets: [
          'Lead the storage platform team building gRPC services in Go',
          'Designed multi-region PostgreSQL replication on AWS',
          'Reduced infrastructure cost 30% with Kubernetes autoscaling and Terraform',
        ],
      },
      {
        title: 'Backend Engineer',
        company: 'Vantage Telecom',
        start: 'Jun 2017',
        end: 'Feb 2020',
        bullets: ['Built billing services in Go and Python with Redis caching'],
      },
    ],
    education: [
      {
        degree: 'M.S. in Computer Science',
        institution: 'Northbridge University',
        start: '2015',
        end: '2017',
      },
    ],
    projects: [],
    certifications: ['Certified Kubernetes Administrator'],
    applications: [{ job: 'backend', status: 'INTERVIEW', daysAgo: 26 }],
  },
  {
    firstName: 'Sofia',
    lastName: 'Alvarez',
    email: email('Sofia', 'Alvarez'),
    phone: '+1 555 010 0108',
    location: 'Miami, FL',
    headline: 'Backend Developer',
    summary:
      'Backend developer with 4 years building Python and Django APIs, recently exploring LLM features.',
    links: ['linkedin.com/in/sofia-alvarez-demo'],
    skills: [
      {
        label: 'Skills',
        items: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'Redis', 'AWS', 'Docker', 'LLMs'],
      },
    ],
    experience: [
      {
        title: 'Backend Developer',
        company: 'Tidewater Travel',
        start: 'Jan 2022',
        end: 'Present',
        bullets: [
          'Build booking APIs with Python, Django and PostgreSQL',
          'Prototyped an LLM-powered itinerary assistant with FastAPI',
        ],
      },
      {
        title: 'Junior Developer',
        company: 'Tidewater Travel',
        start: 'Jan 2021',
        end: 'Dec 2021',
        bullets: ['Maintained Redis-backed background jobs and AWS Lambda functions'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Information Systems',
        institution: 'Coastal State University',
        start: '2016',
        end: '2020',
      },
    ],
    projects: [],
    certifications: [],
    applications: [
      { job: 'backend', status: 'APPLIED', daysAgo: 6 },
      { job: 'ai', status: 'APPLIED', daysAgo: 5 },
    ],
  },
  {
    firstName: 'Liam',
    lastName: "O'Connor",
    email: email('Liam', 'OConnor'),
    phone: '+1 555 010 0109',
    location: 'Boston, MA',
    headline: 'Full Stack Engineer',
    summary:
      'Full stack engineer with 5 years of experience building real-time collaborative applications with React, Node.js and WebSockets.',
    links: ['github.com/liam-oconnor-demo', 'liamoconnor.dev'],
    skills: [
      { label: 'Frontend', items: ['React', 'TypeScript', 'Redux'] },
      { label: 'Backend', items: ['Node.js', 'Express', 'WebSockets', 'REST APIs', 'GraphQL'] },
      { label: 'Data & DevOps', items: ['PostgreSQL', 'Redis', 'Docker', 'AWS'] },
    ],
    experience: [
      {
        title: 'Full Stack Engineer',
        company: 'Chorus Collaboration',
        start: 'Feb 2021',
        end: 'Present',
        bullets: [
          'Built a real-time whiteboard used by 50,000 weekly users with React, Node.js and WebSockets',
          'Designed PostgreSQL schemas and REST APIs for workspace sharing',
          'Scaled WebSocket fan-out with Redis pub/sub on AWS',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Fieldstone Labs',
        start: 'Jun 2019',
        end: 'Jan 2021',
        bullets: ['Developed React dashboards and Node.js services'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Computer Science',
        institution: 'Riverton Institute of Technology',
        start: '2015',
        end: '2019',
      },
    ],
    projects: [
      {
        name: 'LiveCursor',
        description: 'Open-source library for multiplayer cursors built on WebSockets and React',
      },
    ],
    certifications: [],
    applications: [{ job: 'fullstack', status: 'SHORTLISTED', daysAgo: 18 }],
  },
  {
    firstName: 'Fatima',
    lastName: 'Zahra',
    email: email('Fatima', 'Zahra'),
    phone: '+1 555 010 0110',
    location: 'Phoenix, AZ',
    headline: 'Full Stack Developer',
    summary:
      'Full stack developer with 3 years building Angular and Node.js applications on MongoDB.',
    links: ['linkedin.com/in/fatima-zahra-demo'],
    skills: [
      {
        label: 'Skills',
        items: ['Angular', 'TypeScript', 'Node.js', 'Express', 'MongoDB', 'REST APIs'],
      },
    ],
    experience: [
      {
        title: 'Full Stack Developer',
        company: 'Canyon Health Partners',
        start: 'Sep 2022',
        end: 'Present',
        bullets: [
          'Develop scheduling features in Angular and TypeScript',
          'Build Express REST APIs on MongoDB',
        ],
      },
      {
        title: 'Web Developer',
        company: 'Sunridge Media',
        start: 'Jun 2021',
        end: 'Aug 2022',
        bullets: ['Built CMS integrations with Node.js'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Software Engineering',
        institution: 'Southgate University',
        start: '2017',
        end: '2021',
      },
    ],
    projects: [],
    certifications: [],
    applications: [{ job: 'fullstack', status: 'SCREENING', daysAgo: 10 }],
  },
  {
    firstName: 'Noah',
    lastName: 'Fischer',
    email: email('Noah', 'Fischer'),
    phone: '+1 555 010 0111',
    location: 'Portland, OR',
    headline: 'Junior Software Developer',
    summary:
      'Junior developer with one year of professional experience in JavaScript, React and Node.js.',
    links: ['github.com/noah-fischer-demo'],
    skills: [{ label: 'Skills', items: ['JavaScript', 'React', 'Node.js', 'HTML', 'CSS', 'Git'] }],
    experience: [
      {
        title: 'Junior Software Developer',
        company: 'Pinecrest Software',
        start: 'Jul 2025',
        end: 'Present',
        bullets: ['Fix bugs and build small features in React and Node.js'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Computer Science',
        institution: 'Lakeside State University',
        start: '2021',
        end: '2025',
      },
    ],
    projects: [{ name: 'StudyBuddy', description: 'Flashcard app built with React and Firebase' }],
    certifications: [],
    applications: [
      { job: 'fullstack', status: 'REJECTED', daysAgo: 25 },
      { job: 'frontend', status: 'APPLIED', daysAgo: 2 },
    ],
  },
  {
    firstName: 'Grace',
    lastName: 'Mensah',
    email: email('Grace', 'Mensah'),
    phone: '+1 555 010 0112',
    location: 'New York, NY',
    headline: 'Senior Full Stack Engineer',
    summary:
      'Senior full stack engineer with 9 years of experience leading teams that build React and Node.js products on AWS.',
    links: ['linkedin.com/in/grace-mensah-demo'],
    skills: [
      {
        label: 'Engineering',
        items: [
          'React',
          'TypeScript',
          'Node.js',
          'PostgreSQL',
          'GraphQL',
          'REST APIs',
          'System design',
        ],
      },
      { label: 'Cloud', items: ['AWS', 'Docker', 'Kubernetes', 'CI/CD'] },
      { label: 'Leadership', items: ['Mentoring', 'Agile'] },
    ],
    experience: [
      {
        title: 'Engineering Lead',
        company: 'Atlas Learning',
        start: 'May 2020',
        end: 'Present',
        bullets: [
          'Lead a team of 6 engineers building a learning platform with React, Node.js and PostgreSQL',
          'Drove the move to Kubernetes on AWS with CI/CD pipelines',
          'Mentored four engineers to senior level',
        ],
      },
      {
        title: 'Senior Software Engineer',
        company: 'Orbital Media',
        start: 'Mar 2017',
        end: 'Apr 2020',
        bullets: ['Built GraphQL APIs in Node.js and React frontends'],
      },
      {
        title: 'Software Engineer',
        company: 'Pixelcraft Studio',
        start: 'Jun 2016',
        end: 'Feb 2017',
        bullets: ['Developed web applications with JavaScript'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Computer Science',
        institution: 'Northbridge University',
        start: '2012',
        end: '2016',
      },
    ],
    projects: [],
    certifications: ['AWS Certified Solutions Architect – Associate'],
    applications: [{ job: 'fullstack', status: 'OFFER', daysAgo: 27 }],
  },
  {
    firstName: 'Arjun',
    lastName: 'Mehta',
    email: email('Arjun', 'Mehta'),
    phone: '+1 555 010 0113',
    location: 'San Jose, CA',
    headline: 'Machine Learning Engineer',
    summary:
      'ML engineer with 5 years of experience shipping NLP and LLM systems, including RAG pipelines over large document stores.',
    links: ['github.com/arjun-mehta-demo'],
    skills: [
      { label: 'ML', items: ['Python', 'PyTorch', 'LLMs', 'RAG', 'NLP', 'MLOps'] },
      { label: 'Serving & Data', items: ['FastAPI', 'pgvector', 'PostgreSQL', 'Docker', 'AWS'] },
    ],
    experience: [
      {
        title: 'Machine Learning Engineer',
        company: 'Cognitex AI',
        start: 'Jan 2022',
        end: 'Present',
        bullets: [
          'Built a RAG pipeline over 4 million support articles using pgvector and LLMs',
          'Served PyTorch models with FastAPI at 200 requests per second',
          'Set up MLOps monitoring and offline evaluation suites',
        ],
      },
      {
        title: 'Data Scientist',
        company: 'Vantage Telecom',
        start: 'Jun 2020',
        end: 'Dec 2021',
        bullets: ['Trained NLP models in Python for ticket classification'],
      },
    ],
    education: [
      {
        degree: 'M.S. in Machine Learning',
        institution: 'Riverton Institute of Technology',
        start: '2018',
        end: '2020',
      },
    ],
    projects: [
      {
        name: 'EvalBench',
        description: 'Open-source evaluation harness for LLM applications in Python',
      },
    ],
    certifications: [],
    applications: [{ job: 'ai', status: 'INTERVIEW', daysAgo: 16 }],
  },
  {
    firstName: 'Hannah',
    lastName: 'Schmidt',
    email: email('Hannah', 'Schmidt'),
    phone: '+1 555 010 0114',
    location: 'Minneapolis, MN',
    headline: 'Data Scientist',
    summary:
      'Data scientist with 4 years of experience in forecasting and classification using Python, scikit-learn and TensorFlow.',
    links: ['linkedin.com/in/hannah-schmidt-demo'],
    skills: [
      {
        label: 'Skills',
        items: ['Python', 'pandas', 'scikit-learn', 'TensorFlow', 'SQL', 'Machine learning'],
      },
    ],
    experience: [
      {
        title: 'Data Scientist',
        company: 'Prairie Energy',
        start: 'Mar 2022',
        end: 'Present',
        bullets: [
          'Built demand forecasting models in Python with scikit-learn and TensorFlow',
          'Automated reporting with SQL and pandas',
        ],
      },
      {
        title: 'Data Analyst',
        company: 'Prairie Energy',
        start: 'Apr 2021',
        end: 'Feb 2022',
        bullets: ['Created dashboards with SQL'],
      },
    ],
    education: [
      {
        degree: 'M.S. in Statistics',
        institution: 'Lakeside State University',
        start: '2019',
        end: '2021',
      },
    ],
    projects: [],
    certifications: [],
    applications: [{ job: 'ai', status: 'SCREENING', daysAgo: 11 }],
  },
  {
    firstName: 'Omar',
    lastName: 'Haddad',
    email: email('Omar', 'Haddad'),
    phone: '+1 555 010 0115',
    location: 'Oakland, CA',
    headline: 'AI Engineer',
    summary:
      'AI engineer with 3 years building LLM applications: retrieval-augmented generation, agents and evaluation.',
    links: ['github.com/omar-haddad-demo'],
    skills: [
      {
        label: 'Skills',
        items: [
          'Python',
          'LLMs',
          'RAG',
          'LangChain',
          'Pinecone',
          'FastAPI',
          'Docker',
          'TypeScript',
        ],
      },
    ],
    experience: [
      {
        title: 'AI Engineer',
        company: 'Stellar Legal Tech',
        start: 'Jun 2023',
        end: 'Present',
        bullets: [
          'Built a contract Q&A assistant with LLMs, LangChain and Pinecone (RAG)',
          'Shipped FastAPI services and prompt evaluation pipelines',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Stellar Legal Tech',
        start: 'Aug 2022',
        end: 'May 2023',
        bullets: ['Developed document processing services in Python'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Computer Science',
        institution: 'Coastal State University',
        start: '2018',
        end: '2022',
      },
    ],
    projects: [
      { name: 'DocChat', description: 'Chat with PDFs using RAG, Python and a vector database' },
    ],
    certifications: [],
    applications: [{ job: 'ai', status: 'SHORTLISTED', daysAgo: 14 }],
  },
  {
    firstName: 'Chloe',
    lastName: 'Dubois',
    email: email('Chloe', 'Dubois'),
    phone: '+1 555 010 0116',
    location: 'Remote',
    headline: 'Data Analyst',
    summary:
      'Data analyst with 3 years turning product data into decisions with SQL, Python and dbt.',
    links: ['linkedin.com/in/chloe-dubois-demo'],
    skills: [{ label: 'Skills', items: ['SQL', 'Python', 'pandas', 'dbt', 'Snowflake'] }],
    experience: [
      {
        title: 'Data Analyst',
        company: 'Bluebird Retail',
        start: 'Feb 2022',
        end: 'Present',
        bullets: ['Maintain dbt models in Snowflake', 'Analyze experiments with SQL and pandas'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Economics',
        institution: 'Southgate University',
        start: '2017',
        end: '2021',
      },
    ],
    projects: [],
    certifications: [],
    applications: [{ job: 'analyst', status: 'HIRED', daysAgo: 70 }],
  },
  {
    firstName: 'Mateo',
    lastName: 'Rossi',
    email: email('Mateo', 'Rossi'),
    phone: '+1 555 010 0117',
    location: 'Dallas, TX',
    headline: 'DevOps Engineer',
    summary:
      'DevOps engineer with 6 years automating AWS infrastructure with Terraform and Kubernetes.',
    links: ['github.com/mateo-rossi-demo'],
    skills: [
      {
        label: 'Skills',
        items: [
          'AWS',
          'Terraform',
          'Kubernetes',
          'CI/CD',
          'Linux',
          'Observability',
          'Python',
          'Docker',
        ],
      },
    ],
    experience: [
      {
        title: 'DevOps Engineer',
        company: 'Summit Freight',
        start: 'Jan 2020',
        end: 'Present',
        bullets: [
          'Run Kubernetes clusters on AWS provisioned with Terraform',
          'Built CI/CD pipelines with GitHub Actions',
        ],
      },
      {
        title: 'Systems Administrator',
        company: 'Summit Freight',
        start: 'Jan 2019',
        end: 'Dec 2019',
        bullets: ['Administered Linux servers and monitoring with Prometheus and Grafana'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Information Technology',
        institution: 'Metro State University',
        start: '2014',
        end: '2018',
      },
    ],
    projects: [],
    certifications: ['HashiCorp Certified: Terraform Associate'],
    applications: [{ job: 'backend', status: 'APPLIED', daysAgo: 3 }],
  },
  {
    firstName: 'Yuki',
    lastName: 'Tanaka',
    email: email('Yuki', 'Tanaka'),
    phone: '+1 555 010 0118',
    location: 'Sacramento, CA',
    headline: 'Junior Data Analyst',
    summary:
      'Analyst with 2 years of experience in SQL and Python, interested in machine learning.',
    links: [],
    skills: [{ label: 'Skills', items: ['SQL', 'Python', 'pandas', 'Machine learning'] }],
    experience: [
      {
        title: 'Junior Data Analyst',
        company: 'Golden State Grocers',
        start: 'Aug 2024',
        end: 'Present',
        bullets: ['Build weekly sales reports with SQL and pandas'],
      },
    ],
    education: [
      {
        degree: 'B.A. in Mathematics',
        institution: 'Coastal State University',
        start: '2020',
        end: '2024',
      },
    ],
    projects: [
      { name: 'Churn Model', description: 'Customer churn prediction with scikit-learn in Python' },
    ],
    certifications: [],
    applications: [
      { job: 'analyst', status: 'REJECTED', daysAgo: 60 },
      { job: 'ai', status: 'APPLIED', daysAgo: 1 },
    ],
  },
];
