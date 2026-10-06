import {
  Braces,
  CalendarClock,
  Cloud,
  Code,
  Cog,
  Database,
  Eye,
  FileCode,
  Globe,
  Inbox,
  Package,
  Plug,
  ScrollText,
  Server,
  Table2,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { TechnicalComponent, TechnicalComponentKind } from '@/db/types';

export type Layer = 'code' | 'database' | 'integration';

export const LAYERS: Array<{ id: Layer; label: string; description: string; icon: LucideIcon }> = [
  { id: 'code', label: 'Source & services', description: 'Classes, packages, methods, services, scheduled jobs and infrastructure', icon: Code },
  { id: 'database', label: 'Database', description: 'Tables, views, stored procedures and triggers', icon: Database },
  { id: 'integration', label: 'Integration & API', description: 'REST, SOAP, queues, middleware and API contracts', icon: Plug },
];

export interface KindField {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  options?: string[];
}

export interface KindMeta {
  label: string;
  layer: Layer;
  icon: LucideIcon;
  fields: KindField[];
  definitionLabel: string;
  definitionPlaceholder?: string;
  hasColumns?: boolean;
}

export const AUTH_METHODS = ['None', 'Basic', 'API key', 'OAuth 2.0', 'JWT / Bearer', 'mTLS', 'SAML', 'Kerberos', 'Other'];

export const KIND_META: Record<TechnicalComponentKind, KindMeta> = {
  class: {
    label: 'Class',
    layer: 'code',
    icon: Braces,
    fields: [
      { key: 'package', label: 'Package / namespace', placeholder: 'e.g. oracle.apps.ap.supplier.server' },
      { key: 'language', label: 'Language', placeholder: 'e.g. Java' },
      { key: 'filePath', label: 'File path', placeholder: 'e.g. src/main/java/…/SupplierAM.java' },
    ],
    definitionLabel: 'Source or outline',
  },
  package: {
    label: 'Package',
    layer: 'code',
    icon: Package,
    fields: [
      { key: 'owner', label: 'Schema / owner', placeholder: 'e.g. APPS' },
      { key: 'language', label: 'Language', placeholder: 'e.g. PL/SQL' },
      { key: 'filePath', label: 'File path', placeholder: 'e.g. patch/115/sql/apsupplb.pls' },
    ],
    definitionLabel: 'Package specification',
  },
  method: {
    label: 'Method',
    layer: 'code',
    icon: Braces,
    fields: [
      { key: 'parent', label: 'Class or package', placeholder: 'e.g. SupplierAM' },
      { key: 'signature', label: 'Signature', placeholder: 'e.g. createSupplier(Row row): Supplier' },
      { key: 'language', label: 'Language', placeholder: 'e.g. Java' },
    ],
    definitionLabel: 'Source',
  },
  service: {
    label: 'Service',
    layer: 'code',
    icon: Cog,
    fields: [
      { key: 'runtime', label: 'Runtime / framework', placeholder: 'e.g. Node.js 20 / Express' },
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://…' },
      { key: 'repository', label: 'Repository', placeholder: 'e.g. github.com/acme/requisition-service' },
    ],
    definitionLabel: 'Notes',
  },
  job: {
    label: 'Scheduled job',
    layer: 'code',
    icon: CalendarClock,
    fields: [
      { key: 'schedule', label: 'Schedule', placeholder: 'e.g. Daily at 02:00, or a cron expression' },
      { key: 'scheduler', label: 'Scheduler', placeholder: 'e.g. Oracle Concurrent Manager, cron, Apex Scheduler' },
      { key: 'owner', label: 'Owner / run-as user' },
    ],
    definitionLabel: 'Command or script',
  },
  cloud: {
    label: 'Cloud resource',
    layer: 'code',
    icon: Cloud,
    fields: [
      { key: 'provider', label: 'Provider', options: ['AWS', 'Azure', 'Google Cloud', 'Oracle Cloud', 'Other'] },
      { key: 'resourceType', label: 'Resource type', placeholder: 'e.g. RDS PostgreSQL, Lambda, Blob storage' },
      { key: 'region', label: 'Region', placeholder: 'e.g. ap-south-1' },
      { key: 'identifier', label: 'Resource ID / ARN' },
    ],
    definitionLabel: 'Configuration notes',
  },
  server: {
    label: 'Server',
    layer: 'code',
    icon: Server,
    fields: [
      { key: 'hostname', label: 'Hostname' },
      { key: 'environment', label: 'Environment', options: ['Development', 'Test', 'UAT', 'Production'] },
      { key: 'os', label: 'Operating system' },
      { key: 'role', label: 'Role', placeholder: 'e.g. Application tier, Database tier' },
    ],
    definitionLabel: 'Notes',
  },
  table: {
    label: 'Table',
    layer: 'database',
    icon: Table2,
    fields: [
      { key: 'schema', label: 'Schema', placeholder: 'e.g. AP' },
      { key: 'database', label: 'Database / instance', placeholder: 'e.g. EBSPROD' },
    ],
    definitionLabel: 'DDL',
    definitionPlaceholder: 'CREATE TABLE …',
    hasColumns: true,
  },
  view: {
    label: 'View',
    layer: 'database',
    icon: Eye,
    fields: [
      { key: 'schema', label: 'Schema' },
      { key: 'baseObjects', label: 'Base tables / views', placeholder: 'e.g. AP_SUPPLIERS, AP_SUPPLIER_SITES_ALL' },
    ],
    definitionLabel: 'SQL definition',
    definitionPlaceholder: 'SELECT … FROM …',
    hasColumns: true,
  },
  procedure: {
    label: 'Stored procedure',
    layer: 'database',
    icon: ScrollText,
    fields: [
      { key: 'schema', label: 'Schema' },
      { key: 'signature', label: 'Signature', placeholder: 'e.g. CREATE_SUPPLIER(p_name IN VARCHAR2, …)' },
      { key: 'language', label: 'Language', placeholder: 'e.g. PL/SQL' },
    ],
    definitionLabel: 'Procedure body',
  },
  trigger: {
    label: 'Trigger',
    layer: 'database',
    icon: Zap,
    fields: [
      { key: 'schema', label: 'Schema' },
      { key: 'table', label: 'On table', placeholder: 'e.g. AP_SUPPLIERS' },
      { key: 'event', label: 'Firing event', placeholder: 'e.g. BEFORE INSERT OR UPDATE' },
    ],
    definitionLabel: 'Trigger body',
  },
  rest: {
    label: 'REST endpoint',
    layer: 'integration',
    icon: Globe,
    fields: [
      { key: 'httpMethod', label: 'HTTP method', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://host/…' },
      { key: 'path', label: 'Path', placeholder: '/suppliers/{vendorId}' },
      { key: 'authMethod', label: 'Authentication', options: AUTH_METHODS },
      { key: 'contentType', label: 'Content type', placeholder: 'application/json' },
      { key: 'requestSchema', label: 'Request payload schema', multiline: true, placeholder: '{ "vendorName": "string", … }' },
      { key: 'responseSchema', label: 'Response payload schema', multiline: true, placeholder: '{ "vendorId": 0, … }' },
    ],
    definitionLabel: 'Sample request and notes',
  },
  soap: {
    label: 'SOAP service',
    layer: 'integration',
    icon: FileCode,
    fields: [
      { key: 'wsdlUrl', label: 'WSDL URL' },
      { key: 'operation', label: 'Operation', placeholder: 'e.g. assignBankAccount' },
      { key: 'authMethod', label: 'Authentication', options: AUTH_METHODS },
      { key: 'requestSchema', label: 'Request payload schema', multiline: true },
      { key: 'responseSchema', label: 'Response payload schema', multiline: true },
    ],
    definitionLabel: 'Sample envelope and notes',
  },
  queue: {
    label: 'Message queue',
    layer: 'integration',
    icon: Inbox,
    fields: [
      { key: 'broker', label: 'Broker / platform', placeholder: 'e.g. Oracle AQ, Kafka, RabbitMQ' },
      { key: 'queueName', label: 'Queue or topic name' },
      { key: 'direction', label: 'Direction', options: ['Producer', 'Consumer', 'Producer and consumer'] },
      { key: 'authMethod', label: 'Authentication', options: AUTH_METHODS },
      { key: 'payloadSchema', label: 'Message payload schema', multiline: true },
    ],
    definitionLabel: 'Notes',
  },
  middleware: {
    label: 'Middleware flow',
    layer: 'integration',
    icon: Workflow,
    fields: [
      { key: 'product', label: 'Product', placeholder: 'e.g. MuleSoft, Oracle SOA Suite' },
      { key: 'flowName', label: 'Flow / process name' },
      { key: 'protocol', label: 'Protocol', placeholder: 'e.g. HTTPS, JMS, SFTP' },
      { key: 'authMethod', label: 'Authentication', options: AUTH_METHODS },
    ],
    definitionLabel: 'Flow notes',
  },
  api: {
    label: 'Other API',
    layer: 'integration',
    icon: Plug,
    fields: [
      { key: 'baseUrl', label: 'Base URL' },
      { key: 'authMethod', label: 'Authentication', options: AUTH_METHODS },
      { key: 'requestSchema', label: 'Request payload schema', multiline: true },
      { key: 'responseSchema', label: 'Response payload schema', multiline: true },
    ],
    definitionLabel: 'Notes',
  },
};

/** Display order, grouped by layer. */
export const KIND_ORDER: TechnicalComponentKind[] = [
  'class', 'package', 'method', 'service', 'job', 'cloud', 'server',
  'table', 'view', 'procedure', 'trigger',
  'rest', 'soap', 'queue', 'middleware', 'api',
];

export const layerOf = (kind: TechnicalComponentKind): Layer => KIND_META[kind].layer;

/** One-line technical summary shown in lists. */
export function describeComponent(c: Pick<TechnicalComponent, 'kind' | 'metadata'>): string {
  const m = c.metadata ?? {};
  switch (c.kind) {
    case 'rest':
      return [m.httpMethod, m.path].filter(Boolean).join(' ');
    case 'soap':
      return m.operation ?? '';
    case 'queue':
      return [m.queueName, m.direction].filter(Boolean).join(' · ');
    case 'job':
      return m.schedule ?? '';
    case 'table':
    case 'view':
    case 'procedure':
    case 'trigger':
      return m.schema ?? '';
    case 'class':
    case 'package':
    case 'method':
      return m.language ?? '';
    case 'middleware':
      return m.product ?? '';
    case 'cloud':
      return [m.provider, m.resourceType].filter(Boolean).join(' · ');
    case 'server':
      return [m.hostname, m.environment].filter(Boolean).join(' · ');
    case 'service':
      return m.runtime ?? '';
    default:
      return m.baseUrl ?? '';
  }
}
