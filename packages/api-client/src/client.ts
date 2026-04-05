import type {
  LoginRequest, RefreshRequest, TokenResponse,
  Device, ListDevicesParams, DevicePolicy, DeviceApp, DeviceViolation, SendCommandRequest,
  Policy, CreatePolicyRequest, UpdatePolicyRequest, PolicyAssignmentRequest, PolicyVersion, PolicyAssignment,
  DeviceGroup, CreateGroupRequest, UpdateGroupRequest, GroupMember,
  Command, ListCommandsParams, BulkCommandRequest, BulkCommandResponse,
  App, CreateAppRequest, UpdateAppRequest, CreateAppVersionRequest, AppVersion, AppAssignmentRequest, AppAssignment,
  KioskProfile, CreateKioskProfileRequest, UpdateKioskProfileRequest,
  ComplianceRule, CreateComplianceRuleRequest, UpdateComplianceRuleRequest, ComplianceStatusSummary, ComplianceViolation, ListViolationsParams,
  Geofence, CreateGeofenceRequest, UpdateGeofenceRequest,
  AuditLog, ListAuditLogsParams,
  Webhook, WebhookWithSecret, CreateWebhookRequest, UpdateWebhookRequest, WebhookDelivery,
  EnrollmentConfig, CreateEnrollmentConfigRequest, EnrollmentQrResponse,
  PaginatedResponse, PaginationParams, DataResponse, ApiError,
} from './types.js';

export class MdmApiError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'MdmApiError';
  }
}

export interface MdmApiClientOptions {
  baseUrl: string;
  authToken?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export class MdmApiClient {
  private baseUrl: string;
  private authToken?: string;
  private apiKey?: string;
  private extraHeaders: Record<string, string>;

  public readonly auth: AuthApi;
  public readonly devices: DevicesApi;
  public readonly policies: PoliciesApi;
  public readonly groups: GroupsApi;
  public readonly commands: CommandsApi;
  public readonly apps: AppsApi;
  public readonly kiosk: KioskApi;
  public readonly compliance: ComplianceApi;
  public readonly geofences: GeofencesApi;
  public readonly audit: AuditApi;
  public readonly webhooks: WebhooksApi;
  public readonly enrollment: EnrollmentApi;

  constructor(options: MdmApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.authToken = options.authToken;
    this.apiKey = options.apiKey;
    this.extraHeaders = options.headers ?? {};

    this.auth = new AuthApi(this);
    this.devices = new DevicesApi(this);
    this.policies = new PoliciesApi(this);
    this.groups = new GroupsApi(this);
    this.commands = new CommandsApi(this);
    this.apps = new AppsApi(this);
    this.kiosk = new KioskApi(this);
    this.compliance = new ComplianceApi(this);
    this.geofences = new GeofencesApi(this);
    this.audit = new AuditApi(this);
    this.webhooks = new WebhooksApi(this);
    this.enrollment = new EnrollmentApi(this);
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  clearAuthToken(): void {
    this.authToken = undefined;
  }

  async request<T>(method: string, path: string, options?: { body?: unknown; params?: Record<string, unknown> }): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const err = data as ApiError;
      throw new MdmApiError(
        err.statusCode ?? response.status,
        err.error ?? 'Error',
        err.message ?? response.statusText,
        err.details,
        err.requestId,
      );
    }

    return data as T;
  }

  async *fetchAll<T>(method: (params: PaginationParams) => Promise<PaginatedResponse<T>>, params?: Omit<PaginationParams, 'page'>): AsyncGenerator<T[], void, unknown> {
    let page = 1;
    const limit = params?.limit ?? 100;
    while (true) {
      const result = await method({ ...params, page, limit });
      yield result.data;
      if (page >= result.pagination.totalPages) break;
      page++;
    }
  }
}

// --- API Resource Classes ---

class AuthApi {
  constructor(private client: MdmApiClient) {}

  login(req: LoginRequest): Promise<TokenResponse> {
    return this.client.request('POST', '/auth/login', { body: req });
  }

  refresh(req: RefreshRequest): Promise<TokenResponse> {
    return this.client.request('POST', '/auth/refresh', { body: req });
  }

  logout(): Promise<{ message: string }> {
    return this.client.request('POST', '/auth/logout');
  }
}

class DevicesApi {
  constructor(private client: MdmApiClient) {}

  list(params?: ListDevicesParams): Promise<PaginatedResponse<Device>> {
    return this.client.request('GET', '/devices', { params: params as Record<string, unknown> });
  }

  get(id: string): Promise<Device> {
    return this.client.request('GET', `/devices/${id}`);
  }

  getPolicies(id: string): Promise<DataResponse<DevicePolicy>> {
    return this.client.request('GET', `/devices/${id}/policies`);
  }

  getApps(id: string): Promise<DataResponse<DeviceApp>> {
    return this.client.request('GET', `/devices/${id}/apps`);
  }

  getCompliance(id: string): Promise<DataResponse<DeviceViolation>> {
    return this.client.request('GET', `/devices/${id}/compliance`);
  }

  sendCommand(id: string, req: SendCommandRequest): Promise<Command> {
    return this.client.request('POST', `/devices/${id}/commands`, { body: req });
  }
}

class PoliciesApi {
  constructor(private client: MdmApiClient) {}

  list(params?: PaginationParams): Promise<PaginatedResponse<Policy>> {
    return this.client.request('GET', '/policies', { params: params as Record<string, unknown> });
  }

  create(req: CreatePolicyRequest): Promise<Policy> {
    return this.client.request('POST', '/policies', { body: req });
  }

  get(id: string): Promise<Policy> {
    return this.client.request('GET', `/policies/${id}`);
  }

  update(id: string, req: UpdatePolicyRequest): Promise<Policy> {
    return this.client.request('PATCH', `/policies/${id}`, { body: req });
  }

  delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/policies/${id}`);
  }

  getVersions(id: string): Promise<DataResponse<PolicyVersion>> {
    return this.client.request('GET', `/policies/${id}/versions`);
  }

  createAssignment(id: string, req: PolicyAssignmentRequest): Promise<PolicyAssignment> {
    return this.client.request('POST', `/policies/${id}/assignments`, { body: req });
  }
}

class GroupsApi {
  constructor(private client: MdmApiClient) {}

  list(params?: PaginationParams): Promise<PaginatedResponse<DeviceGroup>> {
    return this.client.request('GET', '/groups', { params: params as Record<string, unknown> });
  }

  create(req: CreateGroupRequest): Promise<DeviceGroup> {
    return this.client.request('POST', '/groups', { body: req });
  }

  get(id: string): Promise<DeviceGroup> {
    return this.client.request('GET', `/groups/${id}`);
  }

  update(id: string, req: UpdateGroupRequest): Promise<DeviceGroup> {
    return this.client.request('PATCH', `/groups/${id}`, { body: req });
  }

  delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/groups/${id}`);
  }

  addMember(groupId: string, deviceId: string): Promise<GroupMember> {
    return this.client.request('POST', `/groups/${groupId}/members`, { body: { deviceId } });
  }

  removeMember(groupId: string, deviceId: string): Promise<void> {
    return this.client.request('DELETE', `/groups/${groupId}/members/${deviceId}`);
  }
}

class CommandsApi {
  constructor(private client: MdmApiClient) {}

  list(params?: ListCommandsParams): Promise<PaginatedResponse<Command>> {
    return this.client.request('GET', '/commands', { params: params as Record<string, unknown> });
  }

  get(id: string): Promise<Command> {
    return this.client.request('GET', `/commands/${id}`);
  }

  cancel(id: string): Promise<Command> {
    return this.client.request('POST', `/commands/${id}/cancel`);
  }

  bulk(req: BulkCommandRequest): Promise<BulkCommandResponse> {
    return this.client.request('POST', '/commands/bulk', { body: req });
  }
}

class AppsApi {
  constructor(private client: MdmApiClient) {}

  list(params?: PaginationParams): Promise<PaginatedResponse<App>> {
    return this.client.request('GET', '/apps', { params: params as Record<string, unknown> });
  }

  create(req: CreateAppRequest): Promise<App> {
    return this.client.request('POST', '/apps', { body: req });
  }

  get(id: string): Promise<App> {
    return this.client.request('GET', `/apps/${id}`);
  }

  update(id: string, req: UpdateAppRequest): Promise<App> {
    return this.client.request('PATCH', `/apps/${id}`, { body: req });
  }

  delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/apps/${id}`);
  }

  createVersion(appId: string, req: CreateAppVersionRequest): Promise<AppVersion> {
    return this.client.request('POST', `/apps/${appId}/versions`, { body: req });
  }

  createAssignment(appId: string, req: AppAssignmentRequest): Promise<AppAssignment> {
    return this.client.request('POST', `/apps/${appId}/assignments`, { body: req });
  }
}

class KioskApi {
  constructor(private client: MdmApiClient) {}

  list(params?: PaginationParams): Promise<PaginatedResponse<KioskProfile>> {
    return this.client.request('GET', '/kiosk', { params: params as Record<string, unknown> });
  }

  create(req: CreateKioskProfileRequest): Promise<KioskProfile> {
    return this.client.request('POST', '/kiosk', { body: req });
  }

  get(id: string): Promise<KioskProfile> {
    return this.client.request('GET', `/kiosk/${id}`);
  }

  update(id: string, req: UpdateKioskProfileRequest): Promise<KioskProfile> {
    return this.client.request('PATCH', `/kiosk/${id}`, { body: req });
  }

  delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/kiosk/${id}`);
  }
}

class ComplianceApi {
  constructor(private client: MdmApiClient) {}

  listRules(params?: PaginationParams): Promise<PaginatedResponse<ComplianceRule>> {
    return this.client.request('GET', '/compliance/rules', { params: params as Record<string, unknown> });
  }

  createRule(req: CreateComplianceRuleRequest): Promise<ComplianceRule> {
    return this.client.request('POST', '/compliance/rules', { body: req });
  }

  getRule(id: string): Promise<ComplianceRule> {
    return this.client.request('GET', `/compliance/rules/${id}`);
  }

  updateRule(id: string, req: UpdateComplianceRuleRequest): Promise<ComplianceRule> {
    return this.client.request('PATCH', `/compliance/rules/${id}`, { body: req });
  }

  deleteRule(id: string): Promise<void> {
    return this.client.request('DELETE', `/compliance/rules/${id}`);
  }

  getStatus(): Promise<ComplianceStatusSummary> {
    return this.client.request('GET', '/compliance/status');
  }

  listViolations(params?: ListViolationsParams): Promise<PaginatedResponse<ComplianceViolation>> {
    return this.client.request('GET', '/compliance/violations', { params: params as Record<string, unknown> });
  }
}

class GeofencesApi {
  constructor(private client: MdmApiClient) {}

  list(params?: PaginationParams): Promise<PaginatedResponse<Geofence>> {
    return this.client.request('GET', '/geofences', { params: params as Record<string, unknown> });
  }

  create(req: CreateGeofenceRequest): Promise<Geofence> {
    return this.client.request('POST', '/geofences', { body: req });
  }

  get(id: string): Promise<Geofence> {
    return this.client.request('GET', `/geofences/${id}`);
  }

  update(id: string, req: UpdateGeofenceRequest): Promise<Geofence> {
    return this.client.request('PATCH', `/geofences/${id}`, { body: req });
  }

  delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/geofences/${id}`);
  }
}

class AuditApi {
  constructor(private client: MdmApiClient) {}

  list(params?: ListAuditLogsParams): Promise<PaginatedResponse<AuditLog>> {
    return this.client.request('GET', '/audit', { params: params as Record<string, unknown> });
  }
}

class WebhooksApi {
  constructor(private client: MdmApiClient) {}

  list(params?: PaginationParams): Promise<PaginatedResponse<Webhook>> {
    return this.client.request('GET', '/webhooks', { params: params as Record<string, unknown> });
  }

  create(req: CreateWebhookRequest): Promise<WebhookWithSecret> {
    return this.client.request('POST', '/webhooks', { body: req });
  }

  get(id: string): Promise<Webhook> {
    return this.client.request('GET', `/webhooks/${id}`);
  }

  update(id: string, req: UpdateWebhookRequest): Promise<Webhook> {
    return this.client.request('PATCH', `/webhooks/${id}`, { body: req });
  }

  delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/webhooks/${id}`);
  }

  listDeliveries(webhookId: string, params?: PaginationParams): Promise<PaginatedResponse<WebhookDelivery>> {
    return this.client.request('GET', `/webhooks/${webhookId}/deliveries`, { params: params as Record<string, unknown> });
  }
}

class EnrollmentApi {
  constructor(private client: MdmApiClient) {}

  createConfig(req: CreateEnrollmentConfigRequest): Promise<EnrollmentConfig> {
    return this.client.request('POST', '/enrollment/configs', { body: req });
  }

  listConfigs(params?: PaginationParams): Promise<PaginatedResponse<EnrollmentConfig>> {
    return this.client.request('GET', '/enrollment/configs', { params: params as Record<string, unknown> });
  }

  getQrCode(configId: string): Promise<EnrollmentQrResponse> {
    return this.client.request('GET', `/enrollment/qr-code/${configId}`);
  }
}
