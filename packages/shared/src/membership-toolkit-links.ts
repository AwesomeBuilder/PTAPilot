function parseMembershipToolkitUrl(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function isMembershipToolkitDashboardUrl(value: string | undefined) {
  const parsed = parseMembershipToolkitUrl(value);
  return parsed?.pathname.startsWith("/dashboard/") ?? false;
}

export function extractMembershipToolkitNewsletterId(value: string | undefined) {
  const parsed = parseMembershipToolkitUrl(value);

  if (!parsed) {
    return undefined;
  }

  const match = parsed.pathname.match(/\/(?:dashboard\/)?newsletter\/([^/?#]+)/i);
  return match?.[1];
}

export function buildMembershipToolkitDraftsUrl(value: string | undefined) {
  const parsed = parseMembershipToolkitUrl(value);

  if (!parsed) {
    return undefined;
  }

  return `${parsed.origin}/dashboard/newsletters/draft`;
}

export function buildMembershipToolkitDuplicateUrl(value: string | undefined) {
  const parsed = parseMembershipToolkitUrl(value);
  const newsletterId = extractMembershipToolkitNewsletterId(value);

  if (!parsed || !newsletterId) {
    return undefined;
  }

  return `${parsed.origin}/dashboard/newsletter/${newsletterId}`;
}

export function resolveMembershipToolkitDraftsUrl(
  ...values: Array<string | undefined>
) {
  const dashboardUrl = values.find(isMembershipToolkitDashboardUrl);

  if (dashboardUrl) {
    return dashboardUrl;
  }

  for (const value of values) {
    const draftsUrl = buildMembershipToolkitDraftsUrl(value);

    if (draftsUrl) {
      return draftsUrl;
    }
  }

  return undefined;
}

export function resolveMembershipToolkitDuplicateUrl(
  ...values: Array<string | undefined>
) {
  for (const value of values) {
    const duplicateUrl = buildMembershipToolkitDuplicateUrl(value);

    if (duplicateUrl) {
      return duplicateUrl;
    }
  }

  return resolveMembershipToolkitDraftsUrl(...values);
}
