import { create } from 'zustand';
import type {
  Slide,
  SlideCanvas,
  SlideDeck,
  SlideFile,
  SlideMainMessage,
  SlidePendingAsk,
  SlidePhase,
  SlideProject,
  SlideSessionStatus,
} from '../types/index.ts';
import { DEFAULT_SLIDE_CANVAS } from '../types/index.ts';
import {
  projectDeckSlides,
  rebuildDeckProjection,
} from '../utils/slideVfs.ts';

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
  /** True while an agent phase is generating or in its tool loop. */
  busy: boolean;
  /** Suspended question the plan session is waiting on, if any. */
  pendingAsk: SlideAskState | null;
  /** Decoded deck projection from the VFS (drives preview/navigation/export). */
  activeDeck: SlideDeck | null;
  /** Resolved, ordered slides referenced by `activeDeck.slideOrder`. */
  deckSlides: Slide[];
  /** Canvas aspect of the active project (falls back to project/deck canvas). */
  canvas: SlideCanvas;
  /** Index into `deckSlides` currently being previewed. */
  currentSlideIndex: number;
  /** Main transcript for the active project (kept short per PRD US-012). */
  messages: SlideMainMessage[];
  /** Panel layout view for the shell. */
  panelView: SlidePanelView;

  // --- selection / project lifecycle ---
  setActiveProject: (projectId: string | null) => void;
  /** Load a full project into the store and rebuild its deck projection. */
  setActiveProjectData: (project: SlideProject) => void;
  setPhase: (phase: SlidePhase) => void;
  setSessionStatus: (status: SlideSessionStatus) => void;
  setBusy: (busy: boolean) => void;
  setPendingAsk: (pendingAsk: SlideAskState | null) => void;
  /**
   * Record the user's answer to a suspended question (AskPrompt US-017).
   * Clears the pending ask and appends the answer to the transcript; the
   * orchestrator (US-024) resumes the plan session from the recorded answer.
   */
  answerAsk: (projectId: string, answer: string, attachments?: string[]) => void;
  /** Rebuild the deck projection from a fresh VFS (e.g. after build/edit). */
  setActiveDeckFromVfs: (files: SlideFile[]) => void;
  setDeck: (deck: SlideDeck | null) => void;
  selectSlide: (index: number) => void;
  setMessages: (messages: SlideMainMessage[]) => void;
  addMessage: (message: SlideMainMessage) => void;
  setPanelView: (panelView: SlidePanelView) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  activeProjectId: null,
  activeProject: null as SlideProject | null,
  phase: 'idle' as SlidePhase,
  sessionStatus: 'idle' as SlideSessionStatus,
  busy: false,
  pendingAsk: null as SlideAskState | null,
  activeDeck: null,
  deckSlides: [] as Slide[],
  canvas: DEFAULT_SLIDE_CANVAS,
  currentSlideIndex: 0,
  messages: [] as SlideMainMessage[],
  panelView: 'split' as SlidePanelView,
};

export const useSlideStore = create<SlideStoreState>((set) => ({
  ...INITIAL_STATE,

  setActiveProject: (activeProjectId) =>
    set({
      ...INITIAL_STATE,
      activeProjectId,
    }),

  setActiveProjectData: (project) =>
    set(() => {      const deck = rebuildDeckProjection(project.files);
      const slides = projectDeckSlides(project.files, deck);
      return {
        activeProject: project,
        activeProjectId: project.id,
        phase: project.phase,
        messages: project.messages,
        pendingAsk: project.pendingAsk ? { ...project.pendingAsk, projectId: project.id } : null,
        activeDeck: deck,
        deckSlides: slides,
        canvas: project.canvas,
        currentSlideIndex: 0,
      };
    }),

  setPhase: (phase) => set({ phase }),

  setSessionStatus: (sessionStatus) =>
    set(() => ({
      sessionStatus,
      busy: sessionStatus === 'running',
    })),

  setBusy: (busy) => set({ busy }),
  setPendingAsk: (pendingAsk) => set({ pendingAsk }),

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
