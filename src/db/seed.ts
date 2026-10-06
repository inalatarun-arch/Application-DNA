/**
 * Sample enterprise dataset: an Oracle EBS procure-to-pay landscape with the Supplier Maintenance screen,
 * the AP_SUPPLIERS table, Supplier APIs, a Salesforce onboarding front end, a custom requisition portal and SAP.
 * Everything created here is tagged "sample-data" so it can be removed in one click.
 */
import { db } from './db';
import {
  createApplication,
  createFunctionality,
  createModule,
  createScreen,
  createTechnicalComponent,
  deleteApplication,
} from './catalog';
import type { ColumnDef, TechnicalComponentKind } from './types';

export const SAMPLE_TAG = 'sample-data';
const SAMPLE_APP_NAMES = ['Oracle E-Business Suite', 'Salesforce', 'SAP', 'Custom Procurement Portal'];

export interface SampleSummary {
  applications: number;
  screens: number;
  functionalities: number;
  components: number;
}

export async function hasSampleData(): Promise<boolean> {
  return (await db.applications.filter((a) => a.tags.includes(SAMPLE_TAG)).count()) > 0;
}

/** Deletes every application tagged as sample data (cascading to everything beneath it). */
export async function removeSampleData(): Promise<number> {
  const ids = await db.applications.filter((a) => a.tags.includes(SAMPLE_TAG)).primaryKeys();
  for (const id of ids) await deleteApplication(id);
  return ids.length;
}

// ---------------------------------------------------------------- helpers

const col = (name: string, dataType: string, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  name,
  dataType,
  nullable: true,
  key: '',
  references: '',
  description: '',
  ...extra,
});
const pk = (name: string, dataType: string, description = ''): ColumnDef => col(name, dataType, { key: 'PK', nullable: false, description });
const fk = (name: string, dataType: string, references: string, description = ''): ColumnDef => col(name, dataType, { key: 'FK', references, description });

interface ComponentOptions {
  meta?: Record<string, string>;
  definition?: string;
  columns?: ColumnDef[];
  dependsOn?: string[];
  screens?: string[];
  functionalities?: string[];
}

async function component(applicationId: string, kind: TechnicalComponentKind, name: string, description: string, o: ComponentOptions = {}): Promise<string> {
  const c = await createTechnicalComponent(applicationId, kind, name, description);
  await db.technicalComponents.update(c.id, {
    metadata: o.meta ?? {},
    definition: o.definition ?? '',
    columns: o.columns ?? [],
    relatedComponentIds: o.dependsOn ?? [],
    screenIds: o.screens ?? [],
    functionalityIds: o.functionalities ?? [],
  });
  return c.id;
}

// ---------------------------------------------------------------- loader

export async function loadSampleData(): Promise<SampleSummary> {
  const existing = await db.applications.toArray();
  const clash = existing.find((a) => SAMPLE_APP_NAMES.some((n) => n.toLowerCase() === a.name.toLowerCase()));
  if (clash) {
    throw new Error(
      `An application named "${clash.name}" already exists. Delete or rename it first (or use "Remove sample data" if it came from an earlier sample load), then try again.`,
    );
  }

  // ===== Oracle E-Business Suite =====
  const ebs = await createApplication({
    name: 'Oracle E-Business Suite',
    vendor: 'Oracle E-Business Suite',
    domain: 'Finance',
    technicalStack: ['Oracle Forms', 'Oracle Application Framework', 'PL/SQL', 'Oracle Database 19c'],
    criticalTier: 'tier-1',
    description: 'Core ERP for procurement, payables and the general ledger.',
    businessOwner: 'Finance Director',
    technicalOwner: 'ERP Platform Lead',
    tags: ['ERP', 'SOX', SAMPLE_TAG],
  });
  const payables = await createModule(ebs.id, 'Payables', 'Supplier, invoice and payment processing.');
  const purchasing = await createModule(ebs.id, 'Purchasing', 'Purchase orders and receiving.');

  const supplierScreen = await createScreen(ebs.id, payables.id, 'Supplier Maintenance', 'Create and maintain supplier records.');
  await db.screens.update(supplierScreen.id, {
    description: 'Single place to create suppliers, change their status and manage bank accounts.',
    businessProcess: 'Procure to Pay',
    businessOwner: 'Head of Procurement',
    functionalOwner: 'AP Functional Lead',
    navigationPath: 'Payables > Suppliers > Maintain Suppliers',
    fieldDescriptions: [
      { field: 'Supplier Name', description: 'Legal name of the supplier. Must be unique per tax ID.' },
      { field: 'Tax ID', description: 'Government tax registration number used for duplicate checks.' },
      { field: 'Payment Terms', description: 'Default terms copied onto new invoices.' },
      { field: 'Status', description: 'Active, Suspended or Inactive. Only Active suppliers can be paid.' },
    ],
    validationRules: ['Supplier name is mandatory', 'Tax ID must match the country format', 'A duplicate tax ID blocks saving'],
    workflowSteps: ['Procurement user submits the supplier request', 'AP specialist verifies tax and bank details', 'Supplier is activated and synced to downstream systems'],
    approvalLogic: 'New suppliers above the risk threshold need Finance Director approval before activation.',
    exceptionHandling: ['Duplicate supplier: show the existing record and block creation', 'Integration failure: queue the sync and notify the AP team'],
    upstreamSystems: ['Salesforce', 'Custom Procurement Portal'],
    downstreamSystems: ['Invoice Processing', 'Payment Processing'],
  });

  const fnCreate = await createFunctionality(supplierScreen, 'Create Supplier', 'Registers a new supplier after duplicate and tax checks.');
  await db.functionalities.update(fnCreate.id, {
    businessPurpose: 'Make sure only verified suppliers can be paid.',
    userRoles: ['Procurement User', 'AP Specialist'],
    triggers: ['Supplier request approved in Salesforce', 'Manual entry by an AP specialist'],
    inputs: ['Supplier name', 'Tax ID', 'Address', 'Payment terms'],
    outputs: ['Supplier record in Pending status', 'Approval task'],
    upstreamSystems: ['Salesforce'],
    downstreamSystems: ['Invoice Processing'],
    exceptions: {
      validation: ['Tax ID format invalid'],
      error: ['Database unavailable'],
      business: ['Duplicate supplier found'],
      system: ['Middleware timeout'],
    },
  });
  const fnUpdate = await createFunctionality(supplierScreen, 'Update Supplier', 'Changes supplier master data with an audit trail.');
  await db.functionalities.update(fnUpdate.id, { userRoles: ['AP Specialist'], inputs: ['Supplier ID', 'Changed attributes'], outputs: ['Updated supplier record', 'Audit entry'] });
  const fnSuspend = await createFunctionality(supplierScreen, 'Suspend Supplier', 'Blocks new invoices and payments for a supplier.');
  await db.functionalities.update(fnSuspend.id, { userRoles: ['AP Manager'], triggers: ['Compliance flag raised'], outputs: ['Supplier set to Suspended'] });
  const fnBank = await createFunctionality(supplierScreen, 'Assign Bank Account', 'Links one or more verified bank accounts to a supplier.');
  await db.functionalities.update(fnBank.id, { userRoles: ['AP Specialist'], inputs: ['Supplier ID', 'Bank account number', 'Currency'], outputs: ['Account assignment'] });

  const invoiceScreen = await createScreen(ebs.id, payables.id, 'Invoice Workbench', 'Enter, validate and approve supplier invoices.');
  await db.screens.update(invoiceScreen.id, { businessProcess: 'Procure to Pay', businessOwner: 'Head of Accounts Payable', functionalOwner: 'AP Functional Lead', navigationPath: 'Payables > Invoices > Entry > Invoice Workbench', upstreamSystems: ['Supplier Maintenance'], downstreamSystems: ['Payment Batch'] });
  const fnEnterInvoice = await createFunctionality(invoiceScreen, 'Enter Invoice', 'Captures a supplier invoice against an active supplier.');
  await db.functionalities.update(fnEnterInvoice.id, { userRoles: ['AP Clerk'], inputs: ['Supplier', 'Invoice number', 'Amount', 'Currency'], outputs: ['Invoice in Needs Validation status'] });
  const fnValidateInvoice = await createFunctionality(invoiceScreen, 'Validate Invoice', 'Runs tax, matching and period checks.');
  await db.functionalities.update(fnValidateInvoice.id, { userRoles: ['AP Clerk', 'AP Specialist'], outputs: ['Invoice Validated or On Hold'] });

  const paymentScreen = await createScreen(ebs.id, payables.id, 'Payment Batch', 'Select validated invoices and pay them.');
  await db.screens.update(paymentScreen.id, { businessProcess: 'Procure to Pay', businessOwner: 'Treasury Manager', functionalOwner: 'AP Functional Lead', navigationPath: 'Payables > Payments > Entry > Payment Batches' });
  const fnBatch = await createFunctionality(paymentScreen, 'Create Payment Batch', 'Builds a batch of payments from validated invoices.');
  await db.functionalities.update(fnBatch.id, { userRoles: ['Treasury Analyst'], inputs: ['Pay-through date', 'Payment method'], outputs: ['Payment batch', 'Payment file'] });

  const poScreen = await createScreen(ebs.id, purchasing.id, 'Purchase Order Entry', 'Raise and approve purchase orders.');
  await db.screens.update(poScreen.id, { businessProcess: 'Requisition to Order', businessOwner: 'Head of Procurement', functionalOwner: 'Purchasing Functional Lead', navigationPath: 'Purchasing > Purchase Orders > Purchase Orders' });
  const fnCreatePo = await createFunctionality(poScreen, 'Create Purchase Order', 'Creates a standard purchase order for an approved supplier.');
  await db.functionalities.update(fnCreatePo.id, { userRoles: ['Buyer'], inputs: ['Supplier', 'Items', 'Quantities', 'Prices'], outputs: ['Purchase order'] });
  const fnApprovePo = await createFunctionality(poScreen, 'Approve Purchase Order', 'Routes a purchase order through the approval hierarchy.');
  await db.functionalities.update(fnApprovePo.id, { userRoles: ['Procurement Manager'], outputs: ['Approved purchase order'] });

  // --- database layer
  const apSuppliers = await component(ebs.id, 'table', 'AP_SUPPLIERS', 'Supplier master. One row per supplier.', {
    meta: { schema: 'AP', database: 'EBSPROD' },
    columns: [
      pk('VENDOR_ID', 'NUMBER', 'Internal supplier identifier.'),
      col('VENDOR_NAME', 'VARCHAR2(240)', { nullable: false, description: 'Legal name.' }),
      col('SEGMENT1', 'VARCHAR2(30)', { description: 'Supplier number shown to users.' }),
      col('VENDOR_TYPE_LOOKUP_CODE', 'VARCHAR2(30)', { description: 'Supplier type.' }),
      col('VAT_REGISTRATION_NUM', 'VARCHAR2(20)', { description: 'Tax registration number.' }),
      col('ENABLED_FLAG', 'VARCHAR2(1)', { nullable: false, description: 'Y when the supplier is active.' }),
      col('END_DATE_ACTIVE', 'DATE', { description: 'Set when the supplier is suspended or retired.' }),
      col('CREATION_DATE', 'DATE', { nullable: false }),
      col('LAST_UPDATE_DATE', 'DATE', { nullable: false }),
    ],
    definition: 'CREATE TABLE ap.ap_suppliers (\n  vendor_id NUMBER NOT NULL,\n  vendor_name VARCHAR2(240) NOT NULL,\n  segment1 VARCHAR2(30),\n  vendor_type_lookup_code VARCHAR2(30),\n  vat_registration_num VARCHAR2(20),\n  enabled_flag VARCHAR2(1) NOT NULL,\n  end_date_active DATE,\n  creation_date DATE NOT NULL,\n  last_update_date DATE NOT NULL,\n  CONSTRAINT ap_suppliers_pk PRIMARY KEY (vendor_id)\n);',
  });
  const apSites = await component(ebs.id, 'table', 'AP_SUPPLIER_SITES_ALL', 'Supplier sites: addresses and operating-unit assignments.', {
    meta: { schema: 'AP', database: 'EBSPROD' },
    columns: [
      pk('VENDOR_SITE_ID', 'NUMBER'),
      fk('VENDOR_ID', 'NUMBER', 'AP_SUPPLIERS.VENDOR_ID', 'Owning supplier.'),
      col('VENDOR_SITE_CODE', 'VARCHAR2(15)', { nullable: false }),
      col('ORG_ID', 'NUMBER', { description: 'Operating unit.' }),
      col('PAY_SITE_FLAG', 'VARCHAR2(1)'),
      col('PURCHASING_SITE_FLAG', 'VARCHAR2(1)'),
    ],
    dependsOn: [apSuppliers],
  });
  const ibyBank = await component(ebs.id, 'table', 'IBY_EXT_BANK_ACCOUNTS', 'External bank accounts for suppliers and customers.', {
    meta: { schema: 'IBY', database: 'EBSPROD' },
    columns: [
      pk('EXT_BANK_ACCOUNT_ID', 'NUMBER'),
      col('BANK_ACCOUNT_NUM', 'VARCHAR2(100)', { nullable: false }),
      col('CURRENCY_CODE', 'VARCHAR2(15)'),
      col('BANK_ID', 'NUMBER'),
    ],
  });
  const apInvoices = await component(ebs.id, 'table', 'AP_INVOICES_ALL', 'Supplier invoices.', {
    meta: { schema: 'AP', database: 'EBSPROD' },
    columns: [
      pk('INVOICE_ID', 'NUMBER'),
      fk('VENDOR_ID', 'NUMBER', 'AP_SUPPLIERS.VENDOR_ID'),
      col('INVOICE_NUM', 'VARCHAR2(50)', { nullable: false }),
      col('INVOICE_AMOUNT', 'NUMBER'),
      col('INVOICE_CURRENCY_CODE', 'VARCHAR2(15)'),
      col('WFAPPROVAL_STATUS', 'VARCHAR2(30)', { description: 'Approval workflow status.' }),
    ],
    dependsOn: [apSuppliers],
  });
  const apChecks = await component(ebs.id, 'table', 'AP_CHECKS_ALL', 'Payments issued to suppliers.', {
    meta: { schema: 'AP', database: 'EBSPROD' },
    columns: [
      pk('CHECK_ID', 'NUMBER'),
      fk('VENDOR_ID', 'NUMBER', 'AP_SUPPLIERS.VENDOR_ID'),
      col('AMOUNT', 'NUMBER'),
      col('CHECK_DATE', 'DATE'),
    ],
    dependsOn: [apSuppliers],
  });
  const poHeaders = await component(ebs.id, 'table', 'PO_HEADERS_ALL', 'Purchase order headers.', {
    meta: { schema: 'PO', database: 'EBSPROD' },
    columns: [
      pk('PO_HEADER_ID', 'NUMBER'),
      fk('VENDOR_ID', 'NUMBER', 'AP_SUPPLIERS.VENDOR_ID'),
      col('SEGMENT1', 'VARCHAR2(20)', { description: 'PO number.' }),
      col('AUTHORIZATION_STATUS', 'VARCHAR2(25)'),
    ],
    dependsOn: [apSuppliers],
    functionalities: [fnCreatePo.id, fnApprovePo.id],
  });
  const suppliersView = await component(ebs.id, 'view', 'AP_SUPPLIERS_V', 'Suppliers joined to their sites for read-only lookups.', {
    meta: { schema: 'APPS', baseObjects: 'AP_SUPPLIERS, AP_SUPPLIER_SITES_ALL' },
    columns: [col('VENDOR_ID', 'NUMBER'), col('VENDOR_NAME', 'VARCHAR2(240)'), col('VENDOR_SITE_CODE', 'VARCHAR2(15)')],
    definition: 'SELECT s.vendor_id, s.vendor_name, st.vendor_site_code\nFROM   ap_suppliers s\nJOIN   ap_supplier_sites_all st ON st.vendor_id = s.vendor_id;',
    dependsOn: [apSuppliers, apSites],
  });
  const supplierPkg = await component(ebs.id, 'package', 'AP_SUPPLIER_PKG', 'PL/SQL package holding supplier business rules.', {
    meta: { owner: 'APPS', language: 'PL/SQL', filePath: 'patch/115/sql/apsupplb.pls' },
    definition: 'PACKAGE ap_supplier_pkg AS\n  PROCEDURE create_supplier(p_name IN VARCHAR2, p_tax_id IN VARCHAR2, x_vendor_id OUT NUMBER);\n  PROCEDURE update_supplier(p_vendor_id IN NUMBER, p_name IN VARCHAR2);\n  PROCEDURE suspend_supplier(p_vendor_id IN NUMBER);\n  PROCEDURE assign_bank_account(p_vendor_id IN NUMBER, p_account_id IN NUMBER);\nEND ap_supplier_pkg;',
    dependsOn: [apSuppliers, apSites],
  });
  const procCreate = await component(ebs.id, 'procedure', 'AP_SUPPLIER_PKG.CREATE_SUPPLIER', 'Validates and inserts a supplier, then publishes a sync event.', {
    meta: { schema: 'APPS', signature: 'CREATE_SUPPLIER(p_name IN VARCHAR2, p_tax_id IN VARCHAR2, x_vendor_id OUT NUMBER)', language: 'PL/SQL' },
    dependsOn: [supplierPkg, apSuppliers, apSites],
    functionalities: [fnCreate.id],
  });
  const procUpdate = await component(ebs.id, 'procedure', 'AP_SUPPLIER_PKG.UPDATE_SUPPLIER', 'Updates supplier attributes and writes WHO columns.', {
    meta: { schema: 'APPS', signature: 'UPDATE_SUPPLIER(p_vendor_id IN NUMBER, p_name IN VARCHAR2)', language: 'PL/SQL' },
    dependsOn: [supplierPkg, apSuppliers],
    functionalities: [fnUpdate.id],
  });
  await component(ebs.id, 'procedure', 'AP_SUPPLIER_PKG.SUSPEND_SUPPLIER', 'Sets an end date so the supplier can no longer be used.', {
    meta: { schema: 'APPS', signature: 'SUSPEND_SUPPLIER(p_vendor_id IN NUMBER)', language: 'PL/SQL' },
    dependsOn: [supplierPkg, apSuppliers],
    functionalities: [fnSuspend.id],
  });
  const procBank = await component(ebs.id, 'procedure', 'AP_SUPPLIER_PKG.ASSIGN_BANK_ACCOUNT', 'Links a bank account to a supplier.', {
    meta: { schema: 'APPS', signature: 'ASSIGN_BANK_ACCOUNT(p_vendor_id IN NUMBER, p_account_id IN NUMBER)', language: 'PL/SQL' },
    dependsOn: [supplierPkg, apSuppliers, ibyBank],
    functionalities: [fnBank.id],
  });
  await component(ebs.id, 'trigger', 'AP_SUPPLIERS_BIU_TRG', 'Maintains WHO columns on every insert and update.', {
    meta: { schema: 'AP', table: 'AP_SUPPLIERS', event: 'BEFORE INSERT OR UPDATE' },
    definition: ':NEW.last_update_date := SYSDATE;\nIF INSERTING THEN :NEW.creation_date := SYSDATE; END IF;',
    dependsOn: [apSuppliers],
  });
  await component(ebs.id, 'procedure', 'AP_INVOICE_VALIDATE_PKG.VALIDATE_INVOICES', 'Applies matching, tax and period rules to unvalidated invoices.', {
    meta: { schema: 'APPS', signature: 'VALIDATE_INVOICES(p_batch_id IN NUMBER)', language: 'PL/SQL' },
    dependsOn: [apInvoices, apSuppliers],
    functionalities: [fnValidateInvoice.id],
  });

  // --- integration layer
  const apiCreate = await component(ebs.id, 'rest', 'Supplier API: Create Supplier', 'Creates a supplier from an external system.', {
    meta: {
      httpMethod: 'POST',
      baseUrl: 'https://ebs.example.com',
      path: '/webservices/rest/ap_supplier/create_supplier/',
      authMethod: 'OAuth 2.0',
      contentType: 'application/json',
      requestSchema: '{\n  "vendorName": "string",\n  "taxId": "string",\n  "paymentTerms": "string"\n}',
      responseSchema: '{\n  "vendorId": 0,\n  "status": "PENDING"\n}',
    },
    definition: 'POST /webservices/rest/ap_supplier/create_supplier/\nAuthorization: Bearer <token>\n{"vendorName":"Acme Ltd","taxId":"29ABCDE1234F1Z5","paymentTerms":"NET30"}',
    dependsOn: [procCreate],
    functionalities: [fnCreate.id],
  });
  await component(ebs.id, 'rest', 'Supplier API: Update Supplier', 'Updates supplier attributes.', {
    meta: { httpMethod: 'PUT', baseUrl: 'https://ebs.example.com', path: '/webservices/rest/ap_supplier/update_supplier/{vendorId}', authMethod: 'OAuth 2.0', contentType: 'application/json' },
    dependsOn: [procUpdate],
    functionalities: [fnUpdate.id],
  });
  const apiGet = await component(ebs.id, 'rest', 'Supplier API: Get Supplier', 'Reads a supplier with its sites.', {
    meta: { httpMethod: 'GET', baseUrl: 'https://ebs.example.com', path: '/webservices/rest/ap_supplier/suppliers/{vendorId}', authMethod: 'OAuth 2.0', contentType: 'application/json', responseSchema: '{\n  "vendorId": 0,\n  "vendorName": "string",\n  "sites": []\n}' },
    dependsOn: [suppliersView],
    screens: [supplierScreen.id],
  });
  await component(ebs.id, 'soap', 'Supplier Bank Account Service', 'Assigns bank accounts to suppliers for treasury integrations.', {
    meta: { wsdlUrl: 'https://ebs.example.com/webservices/SOAProvider/plsql/ap_supplier_bank/?wsdl', operation: 'assignBankAccount', authMethod: 'Basic' },
    dependsOn: [procBank],
    functionalities: [fnBank.id],
  });
  await component(ebs.id, 'queue', 'SUPPLIER_SYNC_Q', 'Publishes supplier changes to downstream systems.', {
    meta: { broker: 'Oracle Advanced Queuing', queueName: 'APPS.SUPPLIER_SYNC_Q', direction: 'Producer', authMethod: 'None', payloadSchema: '{\n  "event": "CREATED | UPDATED | SUSPENDED",\n  "vendorId": 0,\n  "changedAt": "ISO-8601"\n}' },
    dependsOn: [apSuppliers],
    functionalities: [fnCreate.id, fnUpdate.id, fnSuspend.id],
  });
  await component(ebs.id, 'rest', 'Purchase Order API: Create Standard PO', 'Creates a standard purchase order.', {
    meta: { httpMethod: 'POST', baseUrl: 'https://ebs.example.com', path: '/webservices/rest/po/create_standard_po/', authMethod: 'OAuth 2.0', contentType: 'application/json' },
    dependsOn: [poHeaders],
    functionalities: [fnCreatePo.id],
  });

  // --- source, jobs and infrastructure
  await component(ebs.id, 'class', 'oracle.apps.ap.supplier.server.SupplierAM', 'OAF application module behind the supplier pages.', {
    meta: { package: 'oracle.apps.ap.supplier.server', language: 'Java', filePath: 'oracle/apps/ap/supplier/server/SupplierAM.java' },
    dependsOn: [procCreate, procUpdate],
    screens: [supplierScreen.id],
  });
  await component(ebs.id, 'method', 'SupplierAM.createSupplier', 'Calls the CREATE_SUPPLIER procedure and returns the new vendor id.', {
    meta: { parent: 'SupplierAM', signature: 'createSupplier(Row row): Number', language: 'Java' },
    dependsOn: [procCreate],
    functionalities: [fnCreate.id],
  });
  await component(ebs.id, 'job', 'Supplier Open Interface Import', 'Concurrent program that imports suppliers from the open interface tables.', {
    meta: { schedule: 'Daily at 02:00', scheduler: 'Oracle Concurrent Manager', owner: 'SYSADMIN' },
    definition: 'APXSUIMP  (Payables Open Interface Import: Suppliers)',
    dependsOn: [apSuppliers, apSites],
    functionalities: [fnCreate.id],
  });
  await component(ebs.id, 'job', 'Payables Build Payments', 'Builds payment instructions for a payment batch.', {
    meta: { schedule: 'On demand', scheduler: 'Oracle Concurrent Manager' },
    dependsOn: [apChecks, apInvoices],
    functionalities: [fnBatch.id],
  });
  await component(ebs.id, 'table', 'AP_PAYMENT_SCHEDULES_ALL', 'Installments due for each invoice.', {
    meta: { schema: 'AP', database: 'EBSPROD' },
    columns: [pk('PAYMENT_NUM', 'NUMBER'), fk('INVOICE_ID', 'NUMBER', 'AP_INVOICES_ALL.INVOICE_ID'), col('DUE_DATE', 'DATE')],
    dependsOn: [apInvoices],
    functionalities: [fnEnterInvoice.id],
  });
  await component(ebs.id, 'server', 'ebs-app-prod-01', 'Production application tier.', { meta: { hostname: 'ebs-app-prod-01', environment: 'Production', os: 'Oracle Linux 8', role: 'Application tier' } });
  await component(ebs.id, 'cloud', 'EBS database tier (OCI)', 'Oracle Cloud compute hosting the EBS database.', { meta: { provider: 'Oracle Cloud', resourceType: 'Compute VM.Standard.E4', region: 'ap-hyderabad-1' } });

  // ===== Salesforce =====
  const sf = await createApplication({
    name: 'Salesforce',
    vendor: 'Salesforce',
    domain: 'Sales & CRM',
    technicalStack: ['Apex', 'Lightning Web Components', 'REST API'],
    criticalTier: 'tier-2',
    description: 'Customer management and the front door for supplier onboarding requests.',
    businessOwner: 'VP Sales',
    technicalOwner: 'CRM Platform Lead',
    tags: ['CRM', SAMPLE_TAG],
  });
  const sfModule = await createModule(sf.id, 'Supplier Onboarding', 'Intake and tracking of new supplier requests.');
  const sfScreen = await createScreen(sf.id, sfModule.id, 'Supplier Onboarding Request', 'Collect supplier details and track approval.');
  await db.screens.update(sfScreen.id, { businessProcess: 'Supplier Onboarding', businessOwner: 'Head of Procurement', functionalOwner: 'CRM Functional Lead', navigationPath: 'App Launcher > Supplier Onboarding > New Request', downstreamSystems: ['Oracle E-Business Suite'] });
  const fnSubmit = await createFunctionality(sfScreen, 'Submit Onboarding Request', 'Sends a completed request to Oracle EBS to create the supplier.');
  await db.functionalities.update(fnSubmit.id, { userRoles: ['Procurement User'], triggers: ['User clicks Submit'], inputs: ['Legal name', 'Tax ID', 'Payment terms'], outputs: ['Request in Submitted status'], downstreamSystems: ['Oracle E-Business Suite'], relatedFunctionalityIds: [fnCreate.id] });
  const fnTrack = await createFunctionality(sfScreen, 'Track Onboarding Status', 'Shows the progress of an onboarding request.');
  await db.functionalities.update(fnTrack.id, { userRoles: ['Procurement User'], upstreamSystems: ['Oracle E-Business Suite'] });

  const sfObject = await component(sf.id, 'table', 'Supplier_Onboarding_Request__c', 'Custom object holding onboarding requests.', {
    meta: { schema: 'Salesforce', database: 'Production org' },
    columns: [pk('Id', 'Id'), col('Legal_Name__c', 'Text(240)', { nullable: false }), col('Tax_ID__c', 'Text(30)'), col('Status__c', 'Picklist'), col('EBS_Vendor_Id__c', 'Number', { description: 'Set after Oracle EBS confirms creation.' })],
    screens: [sfScreen.id],
    functionalities: [fnSubmit.id, fnTrack.id],
  });
  const middleware = await component(sf.id, 'middleware', 'MuleSoft: salesforce-supplier-onboarding', 'Maps onboarding requests to the Oracle EBS Create Supplier API.', {
    meta: { product: 'MuleSoft Anypoint', flowName: 'salesforce-supplier-onboarding', protocol: 'HTTPS', authMethod: 'OAuth 2.0' },
    dependsOn: [apiCreate],
    functionalities: [fnSubmit.id],
  });
  await component(sf.id, 'class', 'SupplierOnboardingController', 'Apex controller behind the request screen.', {
    meta: { package: 'default', language: 'Apex', filePath: 'force-app/main/default/classes/SupplierOnboardingController.cls' },
    dependsOn: [sfObject],
    screens: [sfScreen.id],
  });
  await component(sf.id, 'class', 'SupplierOnboardingService', 'Apex service that calls the middleware and stores the result.', {
    meta: { package: 'default', language: 'Apex' },
    dependsOn: [sfObject, middleware],
    functionalities: [fnSubmit.id],
  });
  await component(sf.id, 'job', 'SupplierStatusSyncBatch', 'Scheduled Apex that refreshes request status from Oracle EBS.', {
    meta: { schedule: '0 */30 * * * ?  (every 30 minutes)', scheduler: 'Apex Scheduler' },
    dependsOn: [sfObject, apiGet],
    functionalities: [fnTrack.id],
  });

  // ===== SAP =====
  const sap = await createApplication({
    name: 'SAP',
    vendor: 'SAP',
    domain: 'Supply chain',
    technicalStack: ['ABAP', 'SAP HANA', 'Fiori'],
    criticalTier: 'tier-1',
    description: 'Materials management and warehouse operations.',
    businessOwner: 'COO',
    technicalOwner: 'SAP Basis Lead',
    tags: ['ERP', SAMPLE_TAG],
  });
  const sapModule = await createModule(sap.id, 'Materials Management', 'Purchasing, inventory and goods receipt.');
  const grScreen = await createScreen(sap.id, sapModule.id, 'Goods Receipt (MIGO)', 'Post receipts against purchase orders.');
  await db.screens.update(grScreen.id, { businessProcess: 'Requisition to Order', businessOwner: 'Warehouse Manager', functionalOwner: 'MM Functional Lead', navigationPath: 'Logistics > Materials Management > Inventory Management > Goods Movement > MIGO' });
  const fnGr = await createFunctionality(grScreen, 'Post Goods Receipt', 'Books received quantities and updates stock.');
  await db.functionalities.update(fnGr.id, { userRoles: ['Warehouse Clerk'], inputs: ['Purchase order', 'Received quantity'], outputs: ['Material document'] });
  const mkpf = await component(sap.id, 'table', 'MKPF', 'Material document header.', {
    meta: { schema: 'SAPSR3' },
    columns: [pk('MBLNR', 'CHAR(10)', 'Material document number.'), pk('MJAHR', 'NUMC(4)', 'Document year.'), col('BUDAT', 'DATS', { description: 'Posting date.' })],
    screens: [grScreen.id],
    functionalities: [fnGr.id],
  });
  await component(sap.id, 'table', 'MSEG', 'Material document items.', {
    meta: { schema: 'SAPSR3' },
    columns: [pk('MBLNR', 'CHAR(10)'), pk('ZEILE', 'NUMC(4)'), fk('MJAHR', 'NUMC(4)', 'MKPF.MJAHR'), col('MENGE', 'QUAN(13,3)', { description: 'Quantity.' })],
    dependsOn: [mkpf],
    functionalities: [fnGr.id],
  });

  // ===== Custom Procurement Portal =====
  const portal = await createApplication({
    name: 'Custom Procurement Portal',
    vendor: 'Custom application',
    domain: 'Procurement',
    technicalStack: ['React', 'Node.js', 'PostgreSQL'],
    criticalTier: 'tier-3',
    description: 'In-house portal for purchase requisitions.',
    businessOwner: 'Head of Procurement',
    technicalOwner: 'Portal Tech Lead',
    tags: ['In-house', SAMPLE_TAG],
  });
  const portalModule = await createModule(portal.id, 'Requisitions', 'Purchase requests and approvals.');
  const reqScreen = await createScreen(portal.id, portalModule.id, 'Requisition Entry', 'Raise a purchase requisition.');
  await db.screens.update(reqScreen.id, { businessProcess: 'Requisition to Order', businessOwner: 'Head of Procurement', functionalOwner: 'Procurement Analyst', navigationPath: 'Portal > Requisitions > New', downstreamSystems: ['Oracle E-Business Suite'] });
  const fnReq = await createFunctionality(reqScreen, 'Submit Requisition', 'Creates a requisition and routes it for approval.');
  await db.functionalities.update(fnReq.id, { userRoles: ['Requester'], outputs: ['Requisition', 'Approval task'], downstreamSystems: ['Oracle E-Business Suite'] });
  const reqTable = await component(portal.id, 'table', 'requisitions', 'Requisition headers.', {
    meta: { schema: 'public', database: 'portal' },
    columns: [pk('id', 'uuid'), col('requester_email', 'text', { nullable: false }), col('status', 'text'), col('total_amount', 'numeric(14,2)')],
    screens: [reqScreen.id],
    functionalities: [fnReq.id],
  });
  const rds = await component(portal.id, 'cloud', 'AWS RDS PostgreSQL', 'Managed database for the portal.', { meta: { provider: 'AWS', resourceType: 'RDS PostgreSQL 15', region: 'ap-south-1' } });
  const reqService = await component(portal.id, 'service', 'Requisition Service', 'Node.js API for requisitions.', {
    meta: { runtime: 'Node.js 20 / Express', baseUrl: 'https://portal.example.com' },
    dependsOn: [reqTable, rds],
  });
  await component(portal.id, 'rest', 'POST /api/requisitions', 'Creates a requisition.', {
    meta: { httpMethod: 'POST', baseUrl: 'https://portal.example.com', path: '/api/requisitions', authMethod: 'JWT / Bearer', contentType: 'application/json' },
    dependsOn: [reqService],
    functionalities: [fnReq.id],
  });
  await component(portal.id, 'job', 'nightly-po-status-sync', 'Pulls purchase order status from Oracle EBS into the portal.', {
    meta: { schedule: '0 1 * * *', scheduler: 'cron' },
    dependsOn: [reqTable],
    functionalities: [fnReq.id],
  });

  const [screens, functionalities, components] = await Promise.all([
    db.screens.where('applicationId').anyOf(ebs.id, sf.id, sap.id, portal.id).count(),
    db.functionalities.where('applicationId').anyOf(ebs.id, sf.id, sap.id, portal.id).count(),
    db.technicalComponents.where('applicationId').anyOf(ebs.id, sf.id, sap.id, portal.id).count(),
  ]);
  return { applications: 4, screens, functionalities, components };
}
