// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — ETAPI client
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Client ────────────────────────────────────────────────────────────────────

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
    if (opts.ancestorNoteId)       params.set("ancestorNoteId", opts.ancestorNoteId);
    if (opts.ancestorDepth)        params.set("ancestorDepth", opts.ancestorDepth);
    if (opts.limit != null)        params.set("limit", String(opts.limit));
    if (opts.orderBy)              params.set("orderBy", opts.orderBy);
    if (opts.orderDirection)       params.set("orderDirection", opts.orderDirection);
    if (opts.fastSearch)           params.set("fastSearch", "true");
    if (opts.includeArchivedNotes) params.set("includeArchivedNotes", "true");
    if (opts.debug)                params.set("debug", "true");
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
    if (mime)   body.mime   = mime;
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

  async addLabel(
    noteId: string,
    name: string,
    value: string = "",
    isInheritable: boolean = false
  ): Promise<Attribute> {
    return this.request<Attribute>(`/attributes`, {
      method: "POST",
      body: JSON.stringify({ noteId, type: "label", name, value, isInheritable }),
    });
  }

  async addRelation(
    fromNoteId: string,
    name: string,
    toNoteId: string,
    isInheritable: boolean = false
  ): Promise<Attribute> {
    return this.request<Attribute>(`/attributes`, {
      method: "POST",
      body: JSON.stringify({ noteId: fromNoteId, type: "relation", name, value: toNoteId, isInheritable }),
    });
  }

  async updateAttribute(
    attributeId: string,
    fields: { value?: string; position?: number }
  ): Promise<Attribute> {
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

  async createAttachment(
    ownerId: string,
    title: string,
    mime: string,
    content: string,
    role: string = "file"
  ): Promise<Attachment> {
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
  }

  // ── Graph traversal ────────────────────────────────────────────────────────

  async getLinkedNotes(noteId: string): Promise<Note[]> {
    const note = await this.getNote(noteId);
    const relations = note.attributes.filter((a) => a.type === "relation");
    const linked = await Promise.all(
      relations.map((r) => this.getNote(r.value).catch(() => null))
    );
    return linked.filter((n): n is Note => n !== null);
  }

  // Find notes that have a relation pointing TO this note (reverse traversal)
  async getBacklinks(noteId: string): Promise<Array<{ noteId: string; title: string; relationName: string }>> {
    const backlinks: Array<{ noteId: string; title: string; relationName: string }> = [];

    // Search for notes that own a relation attribute whose value is this noteId.
    // Uses documented ownedAttributes property filter syntax.
    let results: Note[] = [];
    try {
      const res = await this.searchNotes(
        `note.ownedAttributes.type = "relation" && note.ownedAttributes.value = "${noteId}"`,
        { limit: 200, includeArchivedNotes: true }
      );
      results = res.results;
    } catch {
      // Search not supported — return empty
    }

    // Verify and extract relation names from actual attribute data
    await Promise.all(
      results.map(async (n) => {
        try {
          const full = await this.getNote(n.noteId);
          const rels = full.attributes.filter(
            (a) => a.type === "relation" && a.value === noteId
          );
          for (const rel of rels) {
            backlinks.push({ noteId: n.noteId, title: n.title, relationName: rel.name });
          }
        } catch {
          // Skip inaccessible notes
        }
      })
    );

    return backlinks;
  }

  // BFS to find the shortest relation path between two notes
  async findNeuralPath(
    fromId: string,
    toId: string,
    maxDepth: number = 6
  ): Promise<Array<{ noteId: string; title: string; via?: string }> | null> {
    const visited = new Map<string, string[]>(); // noteId → path of IDs
    const queue: Array<{ id: string; path: string[]; vias: string[] }> = [
      { id: fromId, path: [fromId], vias: [] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.set(current.id, current.path);

      if (current.path.length - 1 >= maxDepth) continue;

      let note: Note;
      try {
        note = await this.getNote(current.id);
      } catch {
        continue;
      }

      const relations = note.attributes.filter((a) => a.type === "relation");
      for (const rel of relations) {
        const nextId = rel.value;
        if (visited.has(nextId)) continue;

        if (nextId === toId) {
          // Reconstruct path with titles
          const fullPath = [...current.path, toId];
          const fullVias = [...current.vias, rel.name];
          const result: Array<{ noteId: string; title: string; via?: string }> = [];
          for (let i = 0; i < fullPath.length; i++) {
            try {
              const n = await this.getNote(fullPath[i]);
              result.push({ noteId: n.noteId, title: n.title, via: fullVias[i - 1] });
            } catch {
              result.push({ noteId: fullPath[i], title: "?", via: fullVias[i - 1] });
            }
          }
          return result;
        }

        queue.push({
          id: nextId,
          path: [...current.path, nextId],
          vias: [...current.vias, rel.name],
        });
      }
    }

    return null;
  }

  // BFS neighborhood: all notes reachable within `depth` relation hops
  async getNeighborhood(
    noteId: string,
    depth: number = 2,
    relationType?: string
  ): Promise<Array<{ noteId: string; title: string; depth: number; via?: string; fromNoteId?: string }>> {
    const visited = new Map<string, { title: string; depth: number; via?: string; fromNoteId?: string }>();
    const queue: Array<{ id: string; dist: number; via?: string; from?: string }> = [
      { id: noteId, dist: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;

      let note: Note;
      try {
        note = await this.getNote(current.id);
      } catch {
        continue;
      }

      visited.set(current.id, {
        title: note.title,
        depth: current.dist,
        via: current.via,
        fromNoteId: current.from,
      });

      if (current.dist < depth) {
        const relations = note.attributes.filter(
          (a) => a.type === "relation" && (!relationType || a.name === relationType)
        );
        for (const rel of relations) {
          if (!visited.has(rel.value)) {
            queue.push({ id: rel.value, dist: current.dist + 1, via: rel.name, from: current.id });
          }
        }
      }
    }

    return Array.from(visited.entries()).map(([id, data]) => ({
      noteId: id,
      ...data,
    }));
  }

  // Filtered graph traversal with direction and relation type controls
  async traverseConnectome(
    startId: string,
    opts: {
      maxDepth?: number;
      relationType?: string;
      direction?: "outbound" | "inbound" | "both";
      maxNodes?: number;
    } = {}
  ): Promise<Array<{ noteId: string; title: string; depth: number; via: string; fromNoteId: string }>> {
    const { maxDepth = 3, relationType, direction = "outbound", maxNodes = 50 } = opts;
    const visited = new Map<string, { title: string; depth: number; via: string; fromNoteId: string }>();
    const queue: Array<{ id: string; dist: number; via: string; from: string }> = [
      { id: startId, dist: 0, via: "start", from: "" },
    ];

    while (queue.length > 0 && visited.size < maxNodes) {
      const current = queue.shift()!;
      if (visited.has(current.id) || current.dist > maxDepth) continue;

      let note: Note;
      try {
        note = await this.getNote(current.id);
      } catch {
        continue;
      }

      visited.set(current.id, {
        title: note.title,
        depth: current.dist,
        via: current.via,
        fromNoteId: current.from,
      });

      if (current.dist < maxDepth) {
        if (direction === "outbound" || direction === "both") {
          const rels = note.attributes.filter(
            (a) => a.type === "relation" && (!relationType || a.name === relationType)
          );
          for (const rel of rels) {
            if (!visited.has(rel.value)) {
              queue.push({ id: rel.value, dist: current.dist + 1, via: rel.name, from: current.id });
            }
          }
        }

        if (direction === "inbound" || direction === "both") {
          try {
            const backlinks = await this.getBacklinks(current.id);
            for (const bl of backlinks) {
              if (!relationType || bl.relationName === relationType) {
                if (!visited.has(bl.noteId)) {
                  queue.push({
                    id: bl.noteId,
                    dist: current.dist + 1,
                    via: `←${bl.relationName}`,
                    from: current.id,
                  });
                }
              }
            }
          } catch {
            // Backlink search unavailable
          }
        }
      }
    }

    // Remove start node from results
    visited.delete(startId);

    return Array.from(visited.entries()).map(([id, data]) => ({
      noteId: id,
      ...data,
    }));
  }

  // ── Synapse (relation) helpers ─────────────────────────────────────────────

  // Remove a specific named relation from fromNote to toNote
  async desynapse(fromNoteId: string, relationName: string, toNoteId: string): Promise<void> {
    const note = await this.getNote(fromNoteId);
    const rel = note.attributes.find(
      (a) => a.type === "relation" && a.name === relationName && a.value === toNoteId
    );
    if (!rel) {
      throw new Error(
        `No '${relationName}' relation found from ${fromNoteId} to ${toNoteId}`
      );
    }
    await this.deleteAttribute(rel.attributeId);
  }

  // Increment the synaptic weight for a relation (Hebbian-style strengthening)
  async strengthenSynapse(
    fromNoteId: string,
    relationName: string,
    toNoteId: string
  ): Promise<{ strength: number; labelId: string }> {
    const note = await this.getNote(fromNoteId);
    const labelName = `sw_${relationName}_${toNoteId}`;
    const existing = note.attributes.find(
      (a) => a.type === "label" && a.name === labelName
    );

    if (existing) {
      const newStrength = (parseInt(existing.value, 10) || 0) + 1;
      const updated = await this.updateAttribute(existing.attributeId, {
        value: String(newStrength),
      });
      return { strength: newStrength, labelId: updated.attributeId };
    }

    const created = await this.addLabel(fromNoteId, labelName, "1");
    return { strength: 1, labelId: created.attributeId };
  }

  // Get the strength of a specific relation
  async getSynapseStrength(fromNoteId: string, relationName: string, toNoteId: string): Promise<number> {
    const note = await this.getNote(fromNoteId);
    const labelName = `sw_${relationName}_${toNoteId}`;
    const label = note.attributes.find((a) => a.type === "label" && a.name === labelName);
    return label ? parseInt(label.value, 10) || 0 : 0;
  }

  // Discover all distinct relation type names used across a subtree.
  // Searches for notes with our #noteType label (structured engrams) to keep
  // the scan bounded and relevant — structural scaffold notes are excluded.
  async listSynapseTypes(ancestorNoteId?: string): Promise<string[]> {
    const types = new Set<string>();
    try {
      const res = await this.searchNotes("#noteType", {
        ancestorNoteId,
        limit: 500,
        fastSearch: true,
      });
      for (const n of res.results) {
        try {
          const full = await this.getNote(n.noteId);
          full.attributes
            .filter((a) => a.type === "relation" && !a.name.startsWith("sw_"))
            .forEach((a) => types.add(a.name));
        } catch {
          // Skip inaccessible notes
        }
      }
    } catch {
      // Return empty set on failure
    }
    return Array.from(types).sort();
  }

  // Find all notes that share a specific relation type to/from a given note
  async queryBySynapse(
    noteId: string,
    relationName: string,
    direction: "outbound" | "inbound" = "outbound"
  ): Promise<Array<{ noteId: string; title: string }>> {
    if (direction === "outbound") {
      const note = await this.getNote(noteId);
      const rels = note.attributes.filter(
        (a) => a.type === "relation" && a.name === relationName
      );
      const notes = await Promise.all(
        rels.map((r) =>
          this.getNote(r.value)
            .then((n) => ({ noteId: n.noteId, title: n.title }))
            .catch(() => null)
        )
      );
      return notes.filter((n): n is { noteId: string; title: string } => n !== null);
    }

    // Inbound: use backlinks and filter by relation name
    const backlinks = await this.getBacklinks(noteId);
    return backlinks
      .filter((b) => b.relationName === relationName)
      .map((b) => ({ noteId: b.noteId, title: b.title }));
  }

  // ── Bulk operations ────────────────────────────────────────────────────────

  async bulkAddLabel(
    noteIds: string[],
    name: string,
    value: string = "",
    isInheritable: boolean = false
  ): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    await Promise.all(
      noteIds.map(async (id) => {
        try {
          await this.addLabel(id, name, value, isInheritable);
          success.push(id);
        } catch {
          failed.push(id);
        }
      })
    );

    return { success, failed };
  }

  // ── Convenience helpers ────────────────────────────────────────────────────

  async getNotesByLabel(labelName: string, labelValue?: string): Promise<SearchResult> {
    const query = labelValue != null ? `#${labelName}=${labelValue}` : `#${labelName}`;
    return this.searchNotes(query);
  }

  // Find notes sharing labels with the source note (synapse suggestions)
  async suggestSynapses(
    noteId: string,
    ancestorNoteId: string,
    limit: number = 10
  ): Promise<Array<{ noteId: string; title: string; sharedLabels: string[] }>> {
    const note = await this.getNote(noteId);
    const labels = note.attributes.filter(
      (a) => a.type === "label" && !a.name.startsWith("sw_") && !["noteType", "llmMemory", "dateStored", "dateUpdated"].includes(a.name)
    );
    const existingRelationTargets = new Set(
      note.attributes.filter((a) => a.type === "relation").map((a) => a.value)
    );
    existingRelationTargets.add(noteId);

    if (labels.length === 0) return [];

    const candidates = new Map<string, { title: string; sharedLabels: string[] }>();

    for (const label of labels.slice(0, 6)) {
      const q = label.value ? `#${label.name}=${label.value}` : `#${label.name}`;
      try {
        const res = await this.searchNotes(q, { ancestorNoteId, fastSearch: true, limit: 50 });
        for (const n of res.results) {
          if (existingRelationTargets.has(n.noteId)) continue;
          const labelStr = `${label.name}${label.value ? "=" + label.value : ""}`;
          const existing = candidates.get(n.noteId);
          if (existing) {
            existing.sharedLabels.push(labelStr);
          } else {
            candidates.set(n.noteId, { title: n.title, sharedLabels: [labelStr] });
          }
        }
      } catch {
        // Skip failed label query
      }
    }

    return Array.from(candidates.entries())
      .sort((a, b) => b[1].sharedLabels.length - a[1].sharedLabels.length)
      .slice(0, limit)
      .map(([id, data]) => ({ noteId: id, title: data.title, sharedLabels: data.sharedLabels }));
  }
}
