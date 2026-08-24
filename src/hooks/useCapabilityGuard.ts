import { useCallback, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { useToast } from '../components/ui/toast/useToast.ts';
import {
  specSupportsReasoning,
  specSupportsTools,
} from '../providers/modelSpecs.ts';
import {
  CAPABILITY_ALERTS,
  resolveSpecFromAppState,
  type CapabilityAlertKind,
} from '../utils/modelCapability.ts';

export function useCapabilityGuard() {
  const providerId = useStore((s) => s.providerConfig.providerId);
  const model = useStore((s) => s.providerConfig.model);
  const customProviders = useStore((s) => s.customProviders);
  const fetchedModels = useStore((s) => s.fetchedModels);
  const { toast } = useToast();

  const spec = useMemo(
    () =>
      resolveSpecFromAppState({
        providerConfig: { providerId, model },
        customProviders,
        fetchedModels,
      }),
    [providerId, model, customProviders, fetchedModels],
  );

  const warn = useCallback(
    (kind: CapabilityAlertKind) => {
      const copy = CAPABILITY_ALERTS[kind];
      toast({
        variant: 'warning',
        title: copy.title,
        description: copy.description,
        duration: 8000,
        action: {
          label: 'Configure here',
          onClick: () => {
            const state = useStore.getState();
            state.setSettingsSection('ai');
            state.setView('settings');
          },
        },
      });
    },
    [toast],
  );

  const canEnableTools = specSupportsTools(spec, model);
  const canEnableReasoning = specSupportsReasoning(spec, model);

  const requestEnableTools = useCallback(
    (next: boolean) => {
      if (next && !specSupportsTools(spec, model)) {
        warn('tools');
        return false;
      }
      return true;
    },
    [spec, model, warn],
  );

  const requestEnableReasoning = useCallback(
    (next: boolean) => {
      if (next && !specSupportsReasoning(spec, model)) {
        warn('reasoning');
        return false;
      }
      return true;
    },
    [spec, model, warn],
  );

  return {
    spec,
    canEnableTools,
    canEnableReasoning,
    requestEnableTools,
    requestEnableReasoning,
    warn,
  };
}
