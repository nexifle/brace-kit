import { create } from 'zustand';
import type {
  Slide,
  SlideActivityEvent,
  SlideCanvas,
  SlideDeck,
  SlideFile,
  SlideMainMessage,
  SlidePendingAsk,
  SlidePhase,
  SlideProject,
  SlideSessionStatus,
} from '../types/index.ts';
import { DEFAULT_SLIDE_AGENT_MAX_ROUNDS } from '../types/index.ts';
import {
  projectDeckSlides,
  rebuildDeckProjection,
  upsertSlideFile,
} from '../utils/slideVfs.ts';
import {
  capSlideActivity,
  deleteSlideProject,
  getLastActiveSlideProject,
  getSlideProject,
  listSlideProjects,
  saveSlideActivity,
  saveSlideProject,
  type StoredSlideProject,
} from '../utils/slideDB.ts';


/**
 * Panel layout views inside the Slide Creator shell.
 * `chat` shows the transcript rail; `preview` the sandboxed deck preview;
 * `split` shows both side-by-side (the default).
 */
export type SlidePanelView = 'chat' | 'preview' | 'split';

/** Pending-ask held in the store (project pendingAsk + a projectId for resume routing). */
export interface SlideAskState extends SlidePendingAsk {
  projectId: string;
}

export interface SlideStoreState {
  /** Id of the active slide project, or null when none is open. */
  activeProjectId: string | null;
  /** Loaded copy of the active project from slideDB (may be null before/after selection). */
  activeProject: SlideProject | null;
  /** Current lifecycle phase of the active project. */
  phase: SlidePhase;
  /** Detailed status of the in-flight agent session (drives busy/UI). */
  sessionStatus: SlideSessionStatus;
  /**
   * True while an agent phase is generating or in its tool loop.
   * Single source of truth with sessionStatus: busy === (sessionStatus === 'running').
   */
  busy: boolean;
  /** Suspended question the plan session is waiting on, if any. */
  pendingAsk: SlideAskState | null;
  /** Live / last-run activity feed for the agentic chrome (Amendment A.3). */
  activity: SlideActivityEvent[];
  /** Streaming assistant text for the active model turn (cleared on commit/stop/error). */
  streamingText: string;
  /** Optional reasoning stream if the provider emits it. */
  streamingReasoning: string;
  /** 1-based current model round (0 when idle). */
  agentRound: number;
  agentMaxRounds: number;
  lastToolName: string | null;
  lastError: string | null;
  /** Decoded deck projection from the VFS (drives preview/navigation/export). */
  activeDeck: SlideDeck | null;
  /** Resolved, ordered slides referenced by `activeDeck.slideOrder`. */
  deckSlides: Slide[];
  /** Canvas aspect of the active project; null until the user chooses one. */
  canvas: SlideCanvas | null;
  /** Index into `deckSlides` currently being previewed. */
  currentSlideIndex: number;
  /** Main transcript for the active project (kept short per PRD US-012). */
  messages: SlideMainMessage[];
  /** Panel layout view for the shell. */
  panelView: SlidePanelView;


  // --- selection / project lifecycle ---
  setActiveProject: (projectId: string | null) => void;
  /** Load a full project into the store and rebuild its deck projection. */
  setActiveProjectData: (project: SlideProject & { activity?: SlideActivityEvent[] }) => void;
  setPhase: (phase: SlidePhase) => void;
  /**
   * Set session status and derive `busy` from it.
   * Clears streaming buffers when leaving `running` via stop/error/done/idle/waiting_user.
   */
  setSessionStatus: (status: SlideSessionStatus) => void;
  /**
   * Convenience: set busy and keep sessionStatus in lockstep
   * (`true` → `running`, `false` → `idle` if currently running).
   */
  setBusy: (busy: boolean) => void;
  setPendingAsk: (pendingAsk: SlideAskState | null) => void;
  /** Append an activity event (append-only for the phase run). */
  pushActivity: (event: SlideActivityEvent) => void;
  /** In-place patch of an existing activity row by id (e.g. tool finish). */
  patchActivity: (id: string, partial: Partial<SlideActivityEvent>) => void;
  /** Replace the entire activity list (e.g. phase boundary reset). */
  setActivity: (activity: SlideActivityEvent[]) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (delta: string) => void;
  setStreamingReasoning: (text: string) => void;
  appendStreamingReasoning: (delta: string) => void;
  /** Clear both streaming buffers (turn commit / stop / error). */
  clearStreaming: () => void;
  setAgentRound: (round: number) => void;
  setAgentMaxRounds: (max: number) => void;
  setLastToolName: (name: string | null) => void;
  setLastError: (error: string | null) => void;
  /**
   * Record the user's answer to a suspended question (AskPrompt US-017).
   * Clears the pending ask and appends the answer to the transcript; the
   * orchestrator (US-024) resumes the plan session from the recorded answer.
   */
  answerAsk: (projectId: string, answer: string, attachments?: string[]) => void;
  /** Rebuild the deck projection from a fresh VFS (e.g. after build/edit). */
  setActiveDeckFromVfs: (files: SlideFile[]) => void;
  /** Mark the in-flight phase as user-stopped: clear busy + streaming + any suspended ask. */
  markStopped: () => void;
  /**
   * Delete a project and every piece of its related data (metadata, transcript,
   * VFS, last-active). If it is the active project, reset the workspace to idle.
   */
  deleteProject: (projectId: string) => Promise<void>;
  /**
   * Load (without activating) the sorted project list from slideDB for the
   * history/reopen surface (US-026). Never touches the active project.
   */
  listProjects: () => Promise<StoredSlideProject[]>;
  /**
   * Restore the last-active slide project (or the named one) from slideDB after
   * an extension reload, rebuilding the deck + re-showing any pending ask.
   */
  restoreLastActiveProject: (projectId?: string) => Promise<void>;
  /**
   * Persist an edited plan artifact (`/brief.md` or `/design.md`) back into the
   * VFS and IndexedDB (US-018 plan review editing). Fires on the active project
   * only; leaves the phase unchanged so build gating still applies.
   */
  updatePlanFile: (path: string, content: string) => void;
  /** Transition the active project into the build phase (the Build CTA). */
  requestBuild: () => void;
  setDeck: (deck: SlideDeck | null) => void;
  selectSlide: (index: number) => void;
  setMessages: (messages: SlideMainMessage[]) => void;
  addMessage: (message: SlideMainMessage) => void;
  setPanelView: (panelView: SlidePanelView) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  activeProjectId: null as string | null,
  activeProject: null as SlideProject | null,
  phase: 'idle' as SlidePhase,
  sessionStatus: 'idle' as SlideSessionStatus,
  busy: false,
  pendingAsk: null as SlideAskState | null,
  activity: [] as SlideActivityEvent[],
  streamingText: '',
  streamingReasoning: '',
  agentRound: 0,
  agentMaxRounds: DEFAULT_SLIDE_AGENT_MAX_ROUNDS,
  lastToolName: null as string | null,
  lastError: null as string | null,
  activeDeck: null as SlideDeck | null,
  deckSlides: [] as Slide[],
  canvas: null as SlideCanvas | null,

  currentSlideIndex: 0,
  messages: [] as SlideMainMessage[],
  panelView: 'split' as SlidePanelView,
};

/**
 * Fire-and-forget activity persistence (US-047). Logs a failure (rather than
 * swallowing silently) so silent persistence loss on a blocked DB upgrade is
 * diagnosable — mirrors getSlideActivity/getSlideProject's logging.
 */
function persistActivity(id: string, activity: SlideActivityEvent[]): void {
  saveSlideActivity(id, activity).catch((e) => {
    console.warn('[SlideDB] saveSlideActivity failed:', e);
  });
}

export const useSlideStore = create<SlideStoreState>((set, get) => ({
  ...INITIAL_STATE,

  setActiveProject: (activeProjectId) =>
    set({
      ...INITIAL_STATE,
      activeProjectId,
    }),

  setActiveProjectData: (project) =>
    set((state) => {
      const deck = rebuildDeckProjection(project.files);
      const slides = projectDeckSlides(project.files, deck);
      // Activity lives outside SlideProject (own slideDB store). Orchestrator
      // landProject only ships SlideProject fields — never wipe the live feed
      // when re-landing the SAME project mid/after a phase. Explicit
      // `project.activity` (restore from FullSlideProject) always wins; a
      // different project id without a feed starts empty.
      const sameProject = state.activeProjectId === project.id;
      const activity =
        project.activity !== undefined
          ? project.activity
          : sameProject
            ? state.activity
            : [];
      // Mid-phase landProject (e.g. appendMessage user turn at edit start) must
      // NOT clear sessionStatus/busy — that drops the composer out of Generating
      // / Stop while the agent is still running. Preserve only while same project
      // is actively running or waiting on the user; project switch still resets.
      const preserveLiveSession =
        sameProject &&
        (state.sessionStatus === 'running' || state.sessionStatus === 'waiting_user') &&
        !project.pendingAsk;
      return {
        activeProject: project,
        activeProjectId: project.id,
        phase: project.phase,
        messages: project.messages,
        pendingAsk: project.pendingAsk
          ? { ...project.pendingAsk, projectId: project.id }
          : null,
        sessionStatus: project.pendingAsk
          ? ('waiting_user' as SlideSessionStatus)
          : preserveLiveSession
            ? state.sessionStatus
            : ('idle' as SlideSessionStatus),
        busy: project.pendingAsk
          ? false
          : preserveLiveSession
            ? state.busy
            : false,
        activity,
        streamingText: preserveLiveSession ? state.streamingText : '',
        streamingReasoning: preserveLiveSession ? state.streamingReasoning : '',
        agentRound: preserveLiveSession ? state.agentRound : 0,
        agentMaxRounds: DEFAULT_SLIDE_AGENT_MAX_ROUNDS,
        lastToolName: preserveLiveSession ? state.lastToolName : null,
        lastError: null as string | null,
        activeDeck: deck,
        deckSlides: slides,
        canvas: project.canvas ?? deck.canvas,
        currentSlideIndex: 0,
      };
    }),


  setPhase: (phase) => set({ phase }),

  setSessionStatus: (sessionStatus) =>
    set((state) => {
      const busy = sessionStatus === 'running';
      // Clear streaming when the turn is no longer actively streaming.
      const clearStream =
        sessionStatus === 'stopped' ||
        sessionStatus === 'error' ||
        sessionStatus === 'done' ||
        sessionStatus === 'idle' ||
        (sessionStatus === 'waiting_user' && state.sessionStatus === 'running');
      return {
        sessionStatus,
        busy,
        ...(clearStream ? { streamingText: '', streamingReasoning: '' } : {}),
        ...(sessionStatus === 'running' ? { lastError: null } : {}),
      };
    }),

  // Keep busy and sessionStatus lockstep so callers of either path stay consistent.
  setBusy: (busy) =>
    set((state) => {
      if (busy) {
        return { busy: true, sessionStatus: 'running' as SlideSessionStatus };
      }
      // Only drop to idle when we were running; preserve waiting_user/done/error/stopped.
      if (state.sessionStatus === 'running') {
        return {
          busy: false,
          sessionStatus: 'idle' as SlideSessionStatus,
          streamingText: '',
          streamingReasoning: '',
        };
      }
      return { busy: false };
    }),

  setPendingAsk: (pendingAsk) => set({ pendingAsk }),

  pushActivity: (event) =>
    set((state) => {
      // US-047: keep the feed durable so a reload still shows the last run.
      // Cap the LIVE feed too so it stays identical to what persistence keeps
      // (both use capSlideActivity's 200 default) and memory stays bounded.
      const next = capSlideActivity([...state.activity, event]);
      if (state.activeProjectId) persistActivity(state.activeProjectId, next);
      return { activity: next };
    }),

  patchActivity: (id, partial) =>
    set((state) => {
      const next = capSlideActivity(
        state.activity.map((ev) =>
          ev.id === id ? { ...ev, ...partial, id: ev.id } : ev,
        ),
      );
      if (state.activeProjectId) persistActivity(state.activeProjectId, next);
      return { activity: next };
    }),

  setActivity: (activity) =>
    set((state) => {
      const next = capSlideActivity(activity);
      if (state.activeProjectId) persistActivity(state.activeProjectId, next);
      return { activity: next };
    }),

  setStreamingText: (streamingText) => set({ streamingText }),
  appendStreamingText: (delta) =>
    set((state) => ({ streamingText: state.streamingText + delta })),
  setStreamingReasoning: (streamingReasoning) => set({ streamingReasoning }),
  appendStreamingReasoning: (delta) =>
    set((state) => ({ streamingReasoning: state.streamingReasoning + delta })),
  clearStreaming: () => set({ streamingText: '', streamingReasoning: '' }),

  setAgentRound: (agentRound) => set({ agentRound }),
  setAgentMaxRounds: (agentMaxRounds) => set({ agentMaxRounds }),
  setLastToolName: (lastToolName) => set({ lastToolName }),
  setLastError: (lastError) => set({ lastError }),

  answerAsk: (projectId, answer, _attachments) =>
    set((state) => {
      if (!state.activeProject || state.activeProject.id !== projectId) return {};
      const message: SlideMainMessage = {
        id: `askans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role: 'user',
        content: answer,
        createdAt: Date.now(),
      };
      return {
        pendingAsk: null,
        messages: [...state.messages, message],
        activeProject: {
          ...state.activeProject,
          pendingAsk: undefined,
          messages: [...state.messages, message],
        },
      };
    }),

  setActiveDeckFromVfs: (files) =>
    set((state) => {
      const deck = rebuildDeckProjection(files);
      const slides = projectDeckSlides(files, deck);
      const maxIndex = Math.max(0, slides.length - 1);
      return {
        activeDeck: deck,
        deckSlides: slides,
        canvas: deck.canvas,
        currentSlideIndex: Math.min(state.currentSlideIndex, maxIndex),
        activeProject: state.activeProject ? { ...state.activeProject, files } : null,
      };
    }),

  markStopped: () =>
    set((state) => ({
      busy: false,
      sessionStatus: 'stopped' as SlideSessionStatus,
      pendingAsk: null,
      streamingText: '',
      streamingReasoning: '',
      activeProject: state.activeProject
        ? {
            ...state.activeProject,
            stopped: true,
            pendingAsk: undefined,
          }
        : null,
    })),

  deleteProject: async (projectId) => {
    await deleteSlideProject(projectId);
    set((state) => {
      // If it was the active project, drop back to a clean idle workspace.
      if (state.activeProjectId !== projectId) return {};
      return { ...INITIAL_STATE };
    });
  },

  listProjects: () => listSlideProjects(),

  restoreLastActiveProject: async (projectId) => {
    const id = projectId ?? (await getLastActiveSlideProject());
    if (!id) return;
    const project = await getSlideProject(id);
    if (project) get().setActiveProjectData(project);
  },

  updatePlanFile: (path, content) =>
    set((state) => {
      if (!state.activeProject) return {};
      const files = upsertSlideFile(state.activeProject.files, path, content);
      const nextProject = { ...state.activeProject, files, updatedAt: Date.now() };
      saveSlideProject(nextProject).catch(() => {});
      return { activeProject: nextProject };
    }),

  requestBuild: () =>
    set((state) => {
      if (!state.activeProject) return {};
      const nextProject = { ...state.activeProject, phase: 'build' as SlidePhase };
      saveSlideProject(nextProject).catch(() => {});
      return { activeProject: nextProject, phase: 'build' as SlidePhase };
    }),

  setDeck: (activeDeck) =>
    set((state) => ({
      activeDeck,
      deckSlides: activeDeck
        ? projectDeckSlides(state.activeProject?.files ?? [], activeDeck)
        : [],
    })),

  selectSlide: (index) =>
    set((state) => {
      const max = Math.max(0, state.deckSlides.length - 1);
      return { currentSlideIndex: Math.max(0, Math.min(index, max)) };
    }),

  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setPanelView: (panelView) => set({ panelView }),

  reset: () => set({ ...INITIAL_STATE }),
}));
