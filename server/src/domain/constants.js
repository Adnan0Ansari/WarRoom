export const SEVERITY_IDS = ['sev1', 'sev2', 'sev3', 'sev4'];
export const SEVERITY_RANK = { sev1: 1, sev2: 2, sev3: 3, sev4: 4 };
export const SEVERITY_LABEL = { sev1: 'SEV 1', sev2: 'SEV 2', sev3: 'SEV 3', sev4: 'SEV 4' };
export const STATUS_IDS = ['investigating', 'identified', 'monitoring', 'resolved'];
export const ROLE_IDS = ['commander', 'scribe', 'comms'];

export const SERVICES = [
  { id: 'api-gateway', name: 'API Gateway' },
  { id: 'auth', name: 'Authentication' },
  { id: 'payments', name: 'Payments' },
  { id: 'database', name: 'Primary Database' },
  { id: 'search', name: 'Search' },
  { id: 'notifications', name: 'Notifications' },
  { id: 'web-app', name: 'Web App' },
];
export const SERVICE_IDS = SERVICES.map((s) => s.id);
export const serviceName = (id) => SERVICES.find((s) => s.id === id)?.name || id;
