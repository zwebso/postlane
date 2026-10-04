import { knownMailMx } from "../shared/domain";
import { CLOUDFLARE_MAIL_DNS } from "./providers/spec";

export type DnsComponent = "ownership" | "mx" | "spf" | "dkim" | "dmarc";

export type DnsCheck = {
  component: DnsComponent;
  status: "unknown" | "checking" | "pending" | "valid" | "conflict" | "error";
  detectedValue: string | null;
  errorCode: string | null;
};

type DoHAnswer = { name: string; type: number; data: string; TTL: number };

async function doh(name: string, type: "TXT" | "MX" | "CNAME"): Promise<{ answers: DoHAnswer[]; error?: string }> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/dns-json" } });
    if (!res.ok) return { answers: [], error: "DNS_RESOLVER_ERROR" };
    const data = (await res.json()) as { Status: number; Answer?: DoHAnswer[] };
    if (data.Status === 3) return { answers: [], error: "NXDOMAIN" };
    if (data.Status !== 0) return { answers: [], error: "SERVFAIL" };
    return { answers: data.Answer ?? [] };
  } catch {
    return { answers: [], error: "DNS_TIMEOUT" };
  }
}

function unwrapTxt(data: string): string {
  return data.replace(/^"|"$/g, "").replace(/" "/g, "");
}

export function expectedRecords(domain: string, verifyToken: string) {
  return [
    {
      component: "ownership" as const,
      record_type: "TXT",
      host: "_postlane",
      full_hostname: `_postlane.${domain}`,
      expected_value: `postlane-verify=${verifyToken}`,
      ttl: "Auto",
      mx_priority: null as number | null,
      required: 1,
    },
    {
      component: "mx" as const,
      record_type: "MX",
      host: "@",
      full_hostname: domain,
      expected_value: CLOUDFLARE_MAIL_DNS.mxHosts.join(", "),
      ttl: "Auto",
      mx_priority: 15,
      required: 1,
    },
    {
      component: "spf" as const,
      record_type: "TXT",
      host: "@",
      full_hostname: domain,
      expected_value: CLOUDFLARE_MAIL_DNS.spf,
      ttl: "Auto",
      mx_priority: null,
      required: 1,
    },
    {
      component: "dkim" as const,
      record_type: "TXT",
      host: CLOUDFLARE_MAIL_DNS.dkimHost,
      full_hostname: `${CLOUDFLARE_MAIL_DNS.dkimHost}.${domain}`,
      expected_value: CLOUDFLARE_MAIL_DNS.dkimMatch,
      ttl: "Auto",
      mx_priority: null,
      required: 1,
    },
    {
      component: "dmarc" as const,
      record_type: "TXT",
      host: "_dmarc",
      full_hostname: `_dmarc.${domain}`,
      expected_value: "v=DMARC1; p=none",
      ttl: "Auto",
      mx_priority: null,
      required: 0,
    },
  ];
}

export async function inspectExistingMail(domain: string) {
  const mx = await doh(domain, "MX");
  const hosts = mx.answers.map((a) => a.data.replace(/^\d+\s+/, "").replace(/\.$/, ""));
  const txt = await doh(domain, "TXT");
  const spf = txt.answers.map((a) => unwrapTxt(a.data)).filter((v) => v.toLowerCase().startsWith("v=spf1"));
  return {
    mxHosts: hosts,
    existingProvider: knownMailMx(hosts),
    spfRecords: spf,
    multipleSpf: spf.length > 1,
  };
}

export async function checkRequirement(req: {
  component: DnsComponent;
  record_type: string;
  full_hostname: string;
  expected_value: string;
}): Promise<DnsCheck> {
  const type = req.record_type as "TXT" | "MX" | "CNAME";
  const { answers, error } = await doh(req.full_hostname, type);
  if (error === "DNS_TIMEOUT") {
    return { component: req.component, status: "error", detectedValue: null, errorCode: "DNS_TIMEOUT" };
  }
  if (error === "SERVFAIL" || error === "DNS_RESOLVER_ERROR") {
    return { component: req.component, status: "error", detectedValue: null, errorCode: error };
  }

  const values = answers.map((a) => {
    if (type === "MX") return a.data.replace(/^\d+\s+/, "").replace(/\.$/, "");
    if (type === "TXT") return unwrapTxt(a.data);
    return a.data.replace(/\.$/, "");
  });

  if (req.component === "spf") {
    const spf = values.filter((v) => v.toLowerCase().startsWith("v=spf1"));
    if (spf.length > 1) {
      return {
        component: "spf",
        status: "conflict",
        detectedValue: spf.join(" | "),
        errorCode: "SPF_MULTIPLE_RECORDS",
      };
    }
    if (spf.length === 1 && spf[0] === req.expected_value) {
      return { component: "spf", status: "valid", detectedValue: spf[0], errorCode: null };
    }
    if (spf.length === 1) {
      return { component: "spf", status: "conflict", detectedValue: spf[0], errorCode: "DNS_MISMATCH" };
    }
    return { component: "spf", status: "pending", detectedValue: null, errorCode: "DNS_PENDING" };
  }

  if (req.component === "mx") {
    const match = values.some((v) => v.toLowerCase().includes(CLOUDFLARE_MAIL_DNS.mxMatch));
    if (match) {
      return { component: "mx", status: "valid", detectedValue: values.join(" | "), errorCode: null };
    }
    if (!values.length) {
      return { component: "mx", status: "pending", detectedValue: null, errorCode: "DNS_PENDING" };
    }
    return { component: "mx", status: "conflict", detectedValue: values.join(" | "), errorCode: "DNS_MISMATCH" };
  }

  if (!values.length) {
    return { component: req.component, status: "pending", detectedValue: null, errorCode: "DNS_PENDING" };
  }

  const match = values.some((v) => v === req.expected_value || v.includes(req.expected_value));
  if (match) {
    return { component: req.component, status: "valid", detectedValue: values.join(" | "), errorCode: null };
  }
  return {
    component: req.component,
    status: "conflict",
    detectedValue: values.join(" | "),
    errorCode: "DNS_MISMATCH",
  };
}
