import type { RequirementCategory } from '../enums';

export interface SkillDefinition {
  /** Display name. */
  name: string;
  category: RequirementCategory;
  /** Alternative spellings; normalized the same way as input before lookup. */
  aliases?: string[];
  /** Canonical ids of adjacent skills that earn partial credit during matching. */
  related?: string[];
}

/**
 * Canonical skill taxonomy keyed by canonical id.
 *
 * Canonical ids are produced by `skillKey()` (lowercase, whitespace/dots/hyphens/underscores
 * removed). The taxonomy is intentionally curated rather than exhaustive: unknown skills still
 * normalize to a stable key, they just do not get alias or relatedness support.
 */
export const SKILL_TAXONOMY: Record<string, SkillDefinition> = {
  // ── Languages ──────────────────────────────────────────────────────────────
  javascript: { name: 'JavaScript', category: 'LANGUAGE', aliases: ['js', 'es6', 'ecmascript', 'es2015'], related: ['typescript'] },
  typescript: { name: 'TypeScript', category: 'LANGUAGE', aliases: ['ts'], related: ['javascript'] },
  python: { name: 'Python', category: 'LANGUAGE', aliases: ['python3', 'py'] },
  java: { name: 'Java', category: 'LANGUAGE', aliases: ['java8', 'java11', 'java17'], related: ['kotlin', 'scala'] },
  kotlin: { name: 'Kotlin', category: 'LANGUAGE', related: ['java'] },
  scala: { name: 'Scala', category: 'LANGUAGE', related: ['java'] },
  go: { name: 'Go', category: 'LANGUAGE', aliases: ['golang'] },
  rust: { name: 'Rust', category: 'LANGUAGE' },
  'c++': { name: 'C++', category: 'LANGUAGE', aliases: ['cpp', 'cplusplus'], related: ['c'] },
  c: { name: 'C', category: 'LANGUAGE', related: ['c++'] },
  'c#': { name: 'C#', category: 'LANGUAGE', aliases: ['csharp', 'c sharp'], related: ['net'] },
  ruby: { name: 'Ruby', category: 'LANGUAGE' },
  php: { name: 'PHP', category: 'LANGUAGE' },
  swift: { name: 'Swift', category: 'LANGUAGE' },
  sql: { name: 'SQL', category: 'LANGUAGE', related: ['postgresql', 'mysql'] },
  html: { name: 'HTML', category: 'LANGUAGE', aliases: ['html5'] },
  css: { name: 'CSS', category: 'LANGUAGE', aliases: ['css3'], related: ['tailwindcss', 'sass'] },
  bash: { name: 'Bash', category: 'LANGUAGE', aliases: ['shell', 'shellscripting'] },

  // ── Frontend ───────────────────────────────────────────────────────────────
  react: { name: 'React', category: 'FRAMEWORK', aliases: ['reactjs', 'react js'], related: ['nextjs', 'reactnative'] },
  nextjs: { name: 'Next.js', category: 'FRAMEWORK', aliases: ['next'], related: ['react'] },
  vue: { name: 'Vue.js', category: 'FRAMEWORK', aliases: ['vuejs', 'vue3'], related: ['nuxt'] },
  nuxt: { name: 'Nuxt', category: 'FRAMEWORK', aliases: ['nuxtjs'], related: ['vue'] },
  angular: { name: 'Angular', category: 'FRAMEWORK', aliases: ['angularjs', 'angular2'] },
  svelte: { name: 'Svelte', category: 'FRAMEWORK', aliases: ['sveltekit'] },
  redux: { name: 'Redux', category: 'FRAMEWORK', aliases: ['reduxtoolkit', 'rtk'], related: ['react'] },
  tailwindcss: { name: 'Tailwind CSS', category: 'FRAMEWORK', aliases: ['tailwind'], related: ['css'] },
  sass: { name: 'Sass', category: 'FRAMEWORK', aliases: ['scss'], related: ['css'] },
  reactnative: { name: 'React Native', category: 'FRAMEWORK', related: ['react'] },
  webpack: { name: 'Webpack', category: 'TOOL', related: ['vite'] },
  vite: { name: 'Vite', category: 'TOOL', related: ['webpack'] },
  graphql: { name: 'GraphQL', category: 'CONCEPT', aliases: ['apollo', 'apollographql'] },

  // ── Backend ────────────────────────────────────────────────────────────────
  nodejs: { name: 'Node.js', category: 'FRAMEWORK', aliases: ['node'], related: ['express', 'nestjs'] },
  express: { name: 'Express', category: 'FRAMEWORK', aliases: ['expressjs'], related: ['nodejs'] },
  nestjs: { name: 'NestJS', category: 'FRAMEWORK', aliases: ['nest'], related: ['nodejs', 'express'] },
  django: { name: 'Django', category: 'FRAMEWORK', related: ['python', 'flask', 'fastapi'] },
  flask: { name: 'Flask', category: 'FRAMEWORK', related: ['python', 'django', 'fastapi'] },
  fastapi: { name: 'FastAPI', category: 'FRAMEWORK', related: ['python', 'flask', 'django'] },
  spring: { name: 'Spring Boot', category: 'FRAMEWORK', aliases: ['springboot', 'springframework'], related: ['java'] },
  rails: { name: 'Ruby on Rails', category: 'FRAMEWORK', aliases: ['rubyonrails', 'ror'], related: ['ruby'] },
  laravel: { name: 'Laravel', category: 'FRAMEWORK', related: ['php'] },
  net: { name: '.NET', category: 'FRAMEWORK', aliases: ['dotnet', 'aspnet', 'aspnetcore', 'netcore'], related: ['c#'] },
  restapi: { name: 'REST APIs', category: 'CONCEPT', aliases: ['rest', 'restful', 'restfulapis', 'restapis'] },
  grpc: { name: 'gRPC', category: 'CONCEPT' },
  websockets: { name: 'WebSockets', category: 'CONCEPT', aliases: ['websocket', 'socketio', 'ws'], related: ['realtime'] },
  realtime: { name: 'Real-time systems', category: 'CONCEPT', aliases: ['real-time', 'real time', 'real-time applications', 'realtime applications', 'real-time systems', 'realtimeapplications', 'realtimesystems'], related: ['websockets'] },
  microservices: { name: 'Microservices', category: 'CONCEPT', aliases: ['microservicearchitecture'], related: ['distributedsystems'] },
  distributedsystems: { name: 'Distributed systems', category: 'CONCEPT', related: ['microservices'] },
  systemdesign: { name: 'System design', category: 'CONCEPT', aliases: ['softwarearchitecture'], related: ['distributedsystems'] },

  // ── Data ───────────────────────────────────────────────────────────────────
  postgresql: { name: 'PostgreSQL', category: 'DATABASE', aliases: ['postgres', 'psql', 'pgsql'], related: ['sql', 'mysql'] },
  mysql: { name: 'MySQL', category: 'DATABASE', aliases: ['mariadb'], related: ['sql', 'postgresql'] },
  mongodb: { name: 'MongoDB', category: 'DATABASE', aliases: ['mongo', 'mongoose'] },
  redis: { name: 'Redis', category: 'DATABASE' },
  elasticsearch: { name: 'Elasticsearch', category: 'DATABASE', aliases: ['elastic', 'opensearch'] },
  dynamodb: { name: 'DynamoDB', category: 'DATABASE', related: ['aws'] },
  sqlite: { name: 'SQLite', category: 'DATABASE', related: ['sql'] },
  prisma: { name: 'Prisma', category: 'TOOL', aliases: ['prismaorm'], related: ['postgresql'] },
  kafka: { name: 'Kafka', category: 'TOOL', aliases: ['apachekafka'], related: ['rabbitmq'] },
  rabbitmq: { name: 'RabbitMQ', category: 'TOOL', related: ['kafka'] },
  spark: { name: 'Apache Spark', category: 'TOOL', aliases: ['apachespark', 'pyspark'] },
  airflow: { name: 'Airflow', category: 'TOOL', aliases: ['apacheairflow'] },
  dbt: { name: 'dbt', category: 'TOOL' },
  snowflake: { name: 'Snowflake', category: 'DATABASE' },

  // ── Cloud / DevOps ─────────────────────────────────────────────────────────
  aws: { name: 'AWS', category: 'CLOUD', aliases: ['amazonwebservices', 'ec2', 's3', 'lambda', 'awslambda'], related: ['gcp', 'azure'] },
  gcp: { name: 'Google Cloud', category: 'CLOUD', aliases: ['googlecloud', 'googlecloudplatform'], related: ['aws', 'azure'] },
  azure: { name: 'Azure', category: 'CLOUD', aliases: ['microsoftazure'], related: ['aws', 'gcp'] },
  docker: { name: 'Docker', category: 'DEVOPS', aliases: ['containers', 'dockercompose'], related: ['kubernetes'] },
  kubernetes: { name: 'Kubernetes', category: 'DEVOPS', aliases: ['k8s', 'eks', 'gke', 'aks'], related: ['docker'] },
  terraform: { name: 'Terraform', category: 'DEVOPS', aliases: ['iac', 'infrastructureascode'] },
  cicd: { name: 'CI/CD', category: 'DEVOPS', aliases: ['ci/cd', 'continuousintegration', 'githubactions', 'jenkins', 'gitlabci'] },
  linux: { name: 'Linux', category: 'DEVOPS', aliases: ['unix'] },
  git: { name: 'Git', category: 'TOOL', aliases: ['github', 'gitlab', 'versioncontrol'] },
  nginx: { name: 'Nginx', category: 'DEVOPS' },
  observability: { name: 'Observability', category: 'DEVOPS', aliases: ['monitoring', 'prometheus', 'grafana', 'datadog', 'opentelemetry'] },

  // ── Testing / practices ───────────────────────────────────────────────────
  testing: { name: 'Automated testing', category: 'CONCEPT', aliases: ['unittesting', 'tdd', 'testdrivendevelopment'], related: ['jest', 'cypress', 'playwright'] },
  jest: { name: 'Jest', category: 'TOOL', aliases: ['vitest'], related: ['testing'] },
  cypress: { name: 'Cypress', category: 'TOOL', related: ['playwright', 'testing'] },
  playwright: { name: 'Playwright', category: 'TOOL', related: ['cypress', 'testing'] },
  agile: { name: 'Agile', category: 'CONCEPT', aliases: ['scrum', 'kanban'] },
  accessibility: { name: 'Accessibility', category: 'CONCEPT', aliases: ['a11y', 'wcag'] },
  performance: { name: 'Performance optimization', category: 'CONCEPT', aliases: ['performanceoptimization', 'webperformance'] },
  security: { name: 'Application security', category: 'CONCEPT', aliases: ['appsec', 'owasp', 'websecurity'] },

  // ── AI / ML ────────────────────────────────────────────────────────────────
  machinelearning: { name: 'Machine learning', category: 'AI_ML', aliases: ['ml'], related: ['deeplearning', 'python'] },
  deeplearning: { name: 'Deep learning', category: 'AI_ML', aliases: ['dl', 'neuralnetworks'], related: ['machinelearning', 'pytorch'] },
  pytorch: { name: 'PyTorch', category: 'AI_ML', aliases: ['torch'], related: ['tensorflow', 'deeplearning'] },
  tensorflow: { name: 'TensorFlow', category: 'AI_ML', aliases: ['keras', 'tf'], related: ['pytorch', 'deeplearning'] },
  scikitlearn: { name: 'scikit-learn', category: 'AI_ML', aliases: ['sklearn'], related: ['machinelearning'] },
  nlp: { name: 'NLP', category: 'AI_ML', aliases: ['naturallanguageprocessing'], related: ['llm'] },
  llm: { name: 'LLMs', category: 'AI_ML', aliases: ['llms', 'largelanguagemodels', 'genai', 'generativeai', 'promptengineering'], related: ['nlp', 'rag'] },
  rag: { name: 'RAG', category: 'AI_ML', aliases: ['retrievalaugmentedgeneration'], related: ['llm', 'vectordatabases'] },
  vectordatabases: { name: 'Vector databases', category: 'AI_ML', aliases: ['vectordb', 'pgvector', 'pinecone', 'weaviate', 'embeddings', 'vectorsearch'], related: ['rag'] },
  langchain: { name: 'LangChain', category: 'AI_ML', aliases: ['llamaindex'], related: ['llm', 'rag'] },
  mlops: { name: 'MLOps', category: 'AI_ML', aliases: ['mlflow', 'kubeflow'], related: ['machinelearning'] },
  pandas: { name: 'pandas', category: 'AI_ML', aliases: ['numpy'], related: ['python'] },
  computervision: { name: 'Computer vision', category: 'AI_ML', aliases: ['cv', 'opencv'], related: ['deeplearning'] },

  // ── Design / product / soft skills ─────────────────────────────────────────
  figma: { name: 'Figma', category: 'TOOL' },
  communication: { name: 'Communication', category: 'SOFT_SKILL', aliases: ['communicationskills'] },
  leadership: { name: 'Leadership', category: 'SOFT_SKILL', aliases: ['teamleadership', 'mentoring', 'mentorship'] },
  problemsolving: { name: 'Problem solving', category: 'SOFT_SKILL' },
  collaboration: { name: 'Collaboration', category: 'SOFT_SKILL', aliases: ['teamwork'] },
};
