import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { organizations, users, roles } from '../db/schema.js';

export interface SamlConfig {
  entityId: string;
  ssoLoginUrl: string;
  ssoLogoutUrl?: string;
  certificate: string; // IdP signing certificate (PEM)
  attributeMapping: {
    email: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
}

export interface SamlAssertion {
  nameId: string;
  attributes: Record<string, string | string[]>;
  sessionIndex?: string;
}

export class SamlService {
  private readonly spEntityId: string;
  private readonly spAcsUrl: string;

  constructor(baseUrl: string) {
    this.spEntityId = `${baseUrl}/api/v1/auth/saml/metadata`;
    this.spAcsUrl = `${baseUrl}/api/v1/auth/saml/callback`;
  }

  generateSpMetadata(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${this.spEntityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${this.spAcsUrl}"
      index="0"
      isDefault="true" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  generateAuthnRequest(idpSsoUrl: string, relayState?: string): { redirectUrl: string; requestId: string } {
    const requestId = `_${crypto.randomUUID()}`;
    const issueInstant = new Date().toISOString();

    const authnRequest = `<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${issueInstant}"
  Destination="${idpSsoUrl}"
  AssertionConsumerServiceURL="${this.spAcsUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${this.spEntityId}</saml:Issuer>
  <samlp:NameIDPolicy
    Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    AllowCreate="true" />
</samlp:AuthnRequest>`;

    const encoded = Buffer.from(authnRequest).toString('base64');
    const params = new URLSearchParams({ SAMLRequest: encoded });
    if (relayState) params.set('RelayState', relayState);

    return {
      redirectUrl: `${idpSsoUrl}?${params.toString()}`,
      requestId,
    };
  }

  parseResponse(samlResponseB64: string, _idpCert: string): SamlAssertion {
    const xml = Buffer.from(samlResponseB64, 'base64').toString('utf-8');

    // Extract NameID
    const nameIdMatch = xml.match(/<(?:saml2?:)?NameID[^>]*>([^<]+)<\//);
    const nameId = nameIdMatch?.[1] ?? '';

    // Extract attributes
    const attributes: Record<string, string | string[]> = {};
    const attrRegex = /<(?:saml2?:)?Attribute\s+Name="([^"]+)"[^>]*>\s*<(?:saml2?:)?AttributeValue[^>]*>([^<]+)<\//g;
    let match;
    while ((match = attrRegex.exec(xml)) !== null) {
      const [, name, value] = match;
      if (attributes[name]) {
        const existing = attributes[name];
        attributes[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        attributes[name] = value;
      }
    }

    // Extract SessionIndex
    const sessionMatch = xml.match(/SessionIndex="([^"]+)"/);

    return {
      nameId,
      attributes,
      sessionIndex: sessionMatch?.[1],
    };
  }

  async findOrCreateUser(
    orgId: string,
    assertion: SamlAssertion,
    attributeMapping: SamlConfig['attributeMapping'],
  ): Promise<{ id: string; email: string; orgId: string; roleId: string }> {
    const email = (assertion.attributes[attributeMapping.email] as string) ?? assertion.nameId;
    const firstName = attributeMapping.firstName
      ? (assertion.attributes[attributeMapping.firstName] as string) ?? null
      : null;
    const lastName = attributeMapping.lastName
      ? (assertion.attributes[attributeMapping.lastName] as string) ?? null
      : null;

    // Try to find existing user
    const [existing] = await db
      .select({ id: users.id, email: users.email, orgId: users.orgId, roleId: users.roleId })
      .from(users)
      .where(and(eq(users.email, email), eq(users.orgId, orgId)))
      .limit(1);

    if (existing) {
      // Update name if changed
      await db
        .update(users)
        .set({ firstName, lastName, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      return existing;
    }

    // Create new user with viewer role
    const [viewerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.name, 'viewer'), eq(roles.isSystem, true)))
      .limit(1);

    const roleId = viewerRole?.id;
    if (!roleId) {
      throw new Error('Default viewer role not found for organization');
    }

    // SSO users get a random password hash (they authenticate via IdP)
    const ssoPlaceholder = `sso$${crypto.randomBytes(16).toString('hex')}$disabled`;

    const [newUser] = await db
      .insert(users)
      .values({
        orgId,
        roleId,
        email,
        passwordHash: ssoPlaceholder,
        firstName,
        lastName,
        isActive: true,
        lastLoginAt: new Date(),
      })
      .returning({ id: users.id, email: users.email, orgId: users.orgId, roleId: users.roleId });

    return newUser;
  }

  async getOrgConfig(orgSlug: string): Promise<{ orgId: string; samlConfig: SamlConfig } | null> {
    const [org] = await db
      .select({ id: organizations.id, settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org) return null;

    const settings = org.settings as Record<string, unknown> | null;
    const samlConfig = settings?.saml as SamlConfig | undefined;
    if (!samlConfig?.entityId || !samlConfig?.ssoLoginUrl) return null;

    return { orgId: org.id, samlConfig };
  }
}
