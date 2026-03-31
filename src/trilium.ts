// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Attribute {
  attributeId: string;
  noteId: string;
  type: "label" | "relation";
  name: string;
  value: string;
  position: number;
  isInheritable: boolean;
  utcDateModified?: string;
}

export interface Branch {
  branchId: string;
  noteId: string;
  parentNoteId: string;
  prefix: string | null;
  notePosition: number;
  isExpanded: boolean;
  utcDateModified: string;
}

export interface Note {
  noteId: string;
  title: string;
  type: string;
  mime: string;
  isProtected: boolean;
  blobId?: string;
  attributes: Attribute[];
  parentNoteIds: string[];
  childNoteIds: string[];
  parentBranchIds: string[];
  childBranchIds: string[];
  dateCreated: string;
  dateModified: string;
  utcDateCreated: string;
  utcDateModified: string;
}

export interface Revision {
  revisionId: string;
  noteId: string;
  type: string;
  mime: string;
  isProtected: boolean;
  title: string;
  blobId: string;
  dateLastEdited: string;
  dateCreated: string;
  utcDateLastEdited: string;
  utcDateCreated: string;
  utcDateModified: string;
  contentLength: number;
}

export interface Attachment {
  attachmentId: string;
  ownerId: string;
  role: string;
  mime: string;
  title: string;
  position: number;
  blobId: string;
  dateModified: string;
  utcDateModified: string;
  utcDateScheduledForErasureSince?: string;
  contentLength: number;
}

export interface RecentChange {
  noteId: string;
  title: string;
  utcDate: string;
  date: string;
  current_title: string;
  current_isDeleted: boolean;
  current_isProtected: boolean;
  canBeUndeleted?: boolean;
}

export interface SearchResult {
  results: Note[];
  debugInfo?: unknown;
}

export interface CreateNoteResponse {
  note: Note;
  branch: Branch;
}

export interface AppInfo {
  appVersion: string;
  dbVersion: number;
  nodeVersion?: string;
  syncVersion: number;
  buildDate: string;
  buildRevision: string;
  dataDirectory?: string;
  clipperProtocolVersion?: string;
  utcDateTime?: string;
}

export interface SearchOpts {
  ancestorNoteId?: string;
  ancestorDepth?: string;
  limit?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  fastSearch?: boolean;
  includeArchivedNotes?: boolean;
  debug?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export class TriliumClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  // ── Core request helper ────────────────────────────────────────────────────

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/etapi${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trilium API error ${res.status}: ${body}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // ── App info ───────────────────────────────────────────────────────────────

  async getAppInfo(): Promise<AppInfo> {
    return this.request<AppInfo>("/app-info");
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async searchNotes(query: string, opts: SearchOpts = {}): Promise<SearchResult> {
    const params = new URLSearchParams({ search: query });
    if (opts.ancestorNoteId)      params.set("ancestorNoteId", opts.ancestorNoteId);
    if (opts.ancestorDepth)       params.set("ancestorDepth", opts.ancestorDepth);
    if (opts.limit != null)       params.set("limit", String(opts.limit));
    if (opts.orderBy)             params.set("orderBy", opts.orderBy);
    if (opts.orderDirection)      params.set("orderDirection", opts.orderDirection);
    if (opts.fastSearch)          params.set("fastSearch", "true");
    if (opts.includeArchivedNotes) params.set("includeArchivedNotes", "true");
    if (opts.debug)               params.set("debug", "true");
    return this.request<SearchResult>(`/notes?${params}`);
  }

  async getNote(noteId: string): Promise<Note> {
    return this.request<Note>(`/notes/${noteId}`);
  }

  async createNote(
    parentNoteId: string,
    title: string,
    content: string,
    type: string = "text",
    mime?: string,
    noteId?: string
  ): Promise<CreateNoteResponse> {
    const body: Record<string, unknown> = { parentNoteId, title, content, type };
    if (mime) body.mime = mime;
    if (noteId) body.noteId = noteId;
    return this.request<CreateNoteResponse>("/create-note", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async patchNote(noteId: string, fields: { title?: string; type?: string; mime?: string }): Promise<Note> {
    return this.request<Note>(`/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  }

  async deleteNote(noteId: string): Promise<void> {
    return this.request<void>(`/notes/${noteId}`, { method: "DELETE" });
  }

  // ── Note content ───────────────────────────────────────────────────────────

  async getNoteContent(noteId: string): Promise<string> {
    const url = `${this.baseUrl}/etapi/notes/${noteId}/content`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trilium API error ${res.status}: ${body}`);
    }
    return res.text();
  }

  async updateNoteContent(noteId: string, content: string): Promise<void> {
    const url = `${this.baseUrl}/etapi/notes/${noteId}/content`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "text/plain" },
      body: content === "" ? " " : content,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trilium API error ${res.status}: ${body}`);
    }
  }

  // ── Revisions ──────────────────────────────────────────────────────────────

  async getNoteRevisions(noteId: string): Promise<Revision[]> {
    return this.request<Revision[]>(`/notes/${noteId}/revisions`);
  }

  async getRevision(revisionId: string): Promise<Revision> {
    return this.request<Revision>(`/revisions/${revisionId}`);
  }

  async getRevisionContent(revisionId: string): Promise<string> {
    const url = `${this.baseUrl}/etapi/revisions/${revisionId}/content`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trilium API error ${res.status}: ${body}`);
    }
    return res.text();
  }

  async createRevision(noteId: string): Promise<void> {
    const url = `${this.baseUrl}/etapi/notes/${noteId}/revision`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trilium API error ${res.status}: ${body}`);
    }
  }

  // ── History ────────────────────────────────────────────────────────────────

  async getNoteHistory(ancestorNoteId?: string): Promise<RecentChange[]> {
    const params = new URLSearchParams();
    if (ancestorNoteId) params.set("ancestorNoteId", ancestorNoteId);
    return this.request<RecentChange[]>(`/notes/history?${params}`);
  }

  // ── Attributes ─────────────────────────────────────────────────────────────

  async getAttribute(attributeId: string): Promise<Attribute> {
    return this.request<Attribute>(`/attributes/${attributeId}`);
  }

  async addLabel(noteId: string, name: string, value: string = "", isInheritable: boolean = false): Promise<Attribute> {
    return this.request<Attribute>(`/attributes`, {
      method: "POST",
      body: JSON.stringify({ noteId, type: "label", name, value, isInheritable }),
    });
  }

  async addRelation(fromNoteId: string, name: string, toNoteId: string, isInheritable: boolean = false): Promise<Attribute> {
    return this.request<Attribute>(`/attributes`, {
      method: "POST",
      body: JSON.stringify({ noteId: fromNoteId, type: "relation", name, value: toNoteId, isInheritable }),
    });
  }

  async updateAttribute(attributeId: string, fields: { value?: string; position?: number }): Promise<Attribute> {
    return this.request<Attribute>(`/attributes/${attributeId}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  }

  async deleteAttribute(attributeId: string): Promise<void> {
    return this.request<void>(`/attributes/${attributeId}`, { method: "DELETE" });
  }

  // ── Branches ───────────────────────────────────────────────────────────────

  async getBranch(branchId: string): Promise<Branch> {
    return this.request<Branch>(`/branches/${branchId}`);
  }

  async cloneNote(noteId: string, parentNoteId: string, prefix?: string): Promise<Branch> {
    return this.request<Branch>(`/branches`, {
      method: "POST",
      body: JSON.stringify({ noteId, parentNoteId, prefix: prefix ?? "" }),
    });
  }

  async deleteBranch(branchId: string): Promise<void> {
    return this.request<void>(`/branches/${branchId}`, { method: "DELETE" });
  }

  // ── Attachments ────────────────────────────────────────────────────────────

  async getNoteAttachments(noteId: string): Promise<Attachment[]> {
    return this.request<Attachment[]>(`/notes/${noteId}/attachments`);
  }

  async getAttachment(attachmentId: string): Promise<Attachment> {
    return this.request<Attachment>(`/attachments/${attachmentId}`);
  }

  async getAttachmentContent(attachmentId: string): Promise<string> {
    const url = `${this.baseUrl}/etapi/attachments/${attachmentId}/content`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trilium API error ${res.status}: ${body}`);
    }
    return res.text();
  }

  async createAttachment(ownerId: string, title: string, mime: string, content: string, role: string = "file"): Promise<Attachment> {
    return this.request<Attachment>(`/attachments`, {
      method: "POST",
      body: JSON.stringify({ ownerId, role, mime, title, content }),
    });
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    return this.request<void>(`/attachments/${attachmentId}`, { method: "DELETE" });
  }

  // ── Calendar / special notes ───────────────────────────────────────────────

  async getDayNote(date: string): Promise<{ noteId: string; title: string }> {
    const note = await this.request<Note>(`/calendar/days/${date}`);
    return { noteId: note.noteId, title: note.title };
  }

  async getWeekNote(week: string): Promise<{ noteId: string; title: string }> {
    const note = await this.request<Note>(`/calendar/weeks/${week}`);
    return { noteId: note.noteId, title: note.title };
  }

  async getMonthNote(month: string): Promise<{ noteId: string; title: string }> {
    const note = await this.request<Note>(`/calendar/months/${month}`);
    return { noteId: note.noteId, title: note.title };
  }

  async getYearNote(year: string): Promise<{ noteId: string; title: string }> {
    const note = await this.request<Note>(`/calendar/years/${year}`);
    return { noteId: note.noteId, title: note.title };
  }

  async getInboxNote(date: string): Promise<{ noteId: string; title: string }> {
    const note = await this.request<Note>(`/inbox/${date}`);
    return { noteId: note.noteId, title: note.title };
  }

  // ── Backup ─────────────────────────────────────────────────────────────────

  async createBackup(date: string): Promise<void> {
    const backupName = `brain-${date}`;
    const url = `${this.baseUrl}/etapi/backup/${backupName}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trilium backup failed (HTTP ${res.status}): ${body}`);
    }
    // 204 No Content on success
  }

  // ── Convenience helpers ────────────────────────────────────────────────────

  async getNotesByLabel(labelName: string, labelValue?: string): Promise<SearchResult> {
    const query = labelValue != null ? `#${labelName}=${labelValue}` : `#${labelName}`;
    return this.searchNotes(query);
  }

  async getLinkedNotes(noteId: string): Promise<Note[]> {
    const note = await this.getNote(noteId);
    const relations = note.attributes.filter((a) => a.type === "relation");
    const linked = await Promise.all(relations.map((r) => this.getNote(r.value).catch(() => null)));
    return linked.filter((n): n is Note => n !== null);
  }
}
