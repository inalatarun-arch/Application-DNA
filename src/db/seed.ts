import { db } from './db';
import { createApplication, createFunctionality, createModule, createScreen } from './catalog';

/** Inserts a small demo catalog so every screen of the module can be explored immediately. */
export async function loadSampleData(): Promise<void> {
  const ebs = await createApplication({
    name: 'Oracle E-Business Suite',
    vendor: 'Oracle E-Business Suite',
    domain: 'Finance',
    technicalStack: ['Oracle Forms', 'PL/SQL', 'Oracle Database 19c'],
    criticalTier: 'tier-1',
    description: 'Core ERP for payables, receivables and the general ledger.',
    businessOwner: 'Finance Director',
    technicalOwner: 'ERP Platform Lead',
    tags: ['ERP', 'SOX'],
  });
  const payables = await createModule(ebs.id, 'Payables', 'Supplier, invoice and payment processing.');
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
    ],
    validationRules: ['Supplier name is mandatory', 'Tax ID must match the country format', 'A duplicate tax ID blocks saving'],
    workflowSteps: ['Procurement user submits the supplier request', 'AP specialist verifies tax and bank details', 'Supplier is activated and synced to downstream systems'],
    approvalLogic: 'New suppliers above the risk threshold need Finance Director approval before activation.',
    exceptionHandling: ['Duplicate supplier: show the existing record and block creation', 'Integration failure: queue the sync and notify the AP team'],
    upstreamSystems: ['Custom Procurement Portal'],
    downstreamSystems: ['Invoice Processing', 'Payment Processing'],
  });

  const create = await createFunctionality(supplierScreen, 'Create Supplier', 'Registers a new supplier after duplicate and tax checks.');
  await db.functionalities.update(create.id, {
    businessPurpose: 'Make sure only verified suppliers can be paid.',
    userRoles: ['Procurement User', 'AP Specialist'],
    triggers: ['Supplier request approved in the procurement portal'],
    inputs: ['Supplier name', 'Tax ID', 'Address', 'Payment terms'],
    outputs: ['Supplier record in Pending status', 'Approval task'],
    upstreamSystems: ['Custom Procurement Portal'],
    downstreamSystems: ['Invoice Processing'],
    exceptions: {
      validation: ['Tax ID format invalid'],
      error: ['Database unavailable'],
      business: ['Duplicate supplier found'],
      system: ['Portal sync timeout'],
    },
  });
  await createFunctionality(supplierScreen, 'Update Supplier', 'Changes supplier master data with an audit trail.');
  await createFunctionality(supplierScreen, 'Suspend Supplier', 'Blocks new invoices and payments for a supplier.');
  await createFunctionality(supplierScreen, 'Assign Bank Account', 'Links one or more verified bank accounts to a supplier.');

  const sf = await createApplication({
    name: 'Salesforce',
    vendor: 'Salesforce',
    domain: 'Sales & CRM',
    technicalStack: ['Apex', 'Lightning Web Components', 'REST API'],
    criticalTier: 'tier-2',
    description: 'Customer and opportunity management.',
    businessOwner: 'VP Sales',
    technicalOwner: 'CRM Platform Lead',
    tags: ['CRM'],
  });
  await createModule(sf.id, 'Accounts & Contacts', 'Customer master data.');

  const sap = await createApplication({
    name: 'SAP',
    vendor: 'SAP',
    domain: 'Supply chain',
    technicalStack: ['ABAP', 'SAP HANA', 'Fiori'],
    criticalTier: 'tier-1',
    description: 'Materials management and warehouse operations.',
    businessOwner: 'COO',
    technicalOwner: 'SAP Basis Lead',
    tags: ['ERP'],
  });
  await createModule(sap.id, 'Materials Management', 'Purchasing, inventory and goods receipt.');

  const portal = await createApplication({
    name: 'Custom Procurement Portal',
    vendor: 'Custom application',
    domain: 'Procurement',
    technicalStack: ['React', 'Node.js', 'PostgreSQL'],
    criticalTier: 'tier-3',
    description: 'In-house portal for purchase requisitions and supplier onboarding requests.',
    businessOwner: 'Head of Procurement',
    technicalOwner: 'Portal Tech Lead',
    tags: ['In-house'],
  });
  await createModule(portal.id, 'Requisitions', 'Purchase requests and approvals.');
}
