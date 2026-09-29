export interface WebDavResource {
  href: string;
  isCollection: boolean;
  contentLength: number;
  lastModified: number;
  etag?: string;
  status?: number;
}

export function parseMultiStatusXml(xml: string): WebDavResource[] {
  const results: WebDavResource[] = [];
  const responseRegex = /<(?:\w+:)?response\b[^>]*>([\s\S]*?)<\/(?:\w+:)?response>/gi;
  let match: RegExpExecArray | null;

  while ((match = responseRegex.exec(xml)) !== null) {
    const block = match[1];

    const hrefMatch = /<(?:\w+:)?href\b[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/i.exec(block);
    if (!hrefMatch) {
      continue;
    }

    let rawHref = hrefMatch[1].trim();
    try {
      rawHref = decodeURIComponent(rawHref);
    } catch {
      // Keep raw if URI decode fails
    }

    const resourceTypeMatch = /<(?:\w+:)?resourcetype\b[^>]*>([\s\S]*?)<\/(?:\w+:)?resourcetype>/i.exec(block);
    const hasCollectionTag = resourceTypeMatch ? /<(?:\w+:)?collection\b[^>]*\/?>/i.test(resourceTypeMatch[1]) : false;
    const isCollection = hasCollectionTag || (rawHref.endsWith("/") && !rawHref.match(/\.[a-zA-Z0-9]+$/));

    let contentLength = 0;
    const lengthMatch = /<(?:\w+:)?getcontentlength\b[^>]*>(\d+)<\/(?:\w+:)?getcontentlength>/i.exec(block);
    if (lengthMatch) {
      contentLength = Number.parseInt(lengthMatch[1], 10);
    }

    let lastModified = 0;
    const modMatch = /<(?:\w+:)?getlastmodified\b[^>]*>([^<]+)<\/(?:\w+:)?getlastmodified>/i.exec(block);
    if (modMatch) {
      const parsedDate = Date.parse(modMatch[1].trim());
      if (!Number.isNaN(parsedDate)) {
        lastModified = parsedDate;
      }
    }

    let etag: string | undefined;
    const etagMatch = /<(?:\w+:)?getetag\b[^>]*>([^<]+)<\/(?:\w+:)?getetag>/i.exec(block);
    if (etagMatch) {
      etag = etagMatch[1].trim().replace(/^["']|["']$/g, "");
    }

    let status = 200;
    const statusMatch = /<(?:\w+:)?status\b[^>]*>HTTP\/[0-9.]+\s+(\d+)/i.exec(block);
    if (statusMatch) {
      status = Number.parseInt(statusMatch[1], 10);
    }

    results.push({
      href: rawHref,
      isCollection,
      contentLength,
      lastModified,
      etag,
      status,
    });
  }

  return results;
}
