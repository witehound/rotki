import { DefiProtocol } from '@rotki/common/lib/blockchain';
import { get } from '@vueuse/core';
import { ActionTree } from 'vuex';
import { getPremium } from '@/composables/session';
import i18n from '@/i18n';
import { balanceKeys } from '@/services/consts';
import { ProtocolVersion } from '@/services/defi/consts';
import { api } from '@/services/rotkehlchen-api';
import { ALL_MODULES } from '@/services/session/consts';
import { Section, Status } from '@/store/const';
import { useAaveStore } from '@/store/defi/aave';
import { useBalancerStore } from '@/store/defi/balancer';
import { useCompoundStore } from '@/store/defi/compound';
import { ACTION_PURGE_PROTOCOL } from '@/store/defi/const';
import { useLiquityStore } from '@/store/defi/liquity';
import { useMakerDaoStore } from '@/store/defi/makerdao';
import { Airdrops, AllDefiProtocols, DefiState } from '@/store/defi/types';
import { useYearnStore } from '@/store/defi/yearn';
import { useNotifications } from '@/store/notifications';
import { useTasks } from '@/store/tasks';
import { RotkehlchenState } from '@/store/types';
import {
  getStatus,
  getStatusUpdater,
  isLoading,
  setStatus
} from '@/store/utils';
import { Module } from '@/types/modules';
import { TaskMeta } from '@/types/task';
import { TaskType } from '@/types/task-type';

export const actions: ActionTree<DefiState, RotkehlchenState> = {
  async fetchDefiBalances({ commit }, refresh: boolean) {
    const section = Section.DEFI_BALANCES;
    const currentStatus = getStatus(section);

    if (
      isLoading(currentStatus) ||
      (currentStatus === Status.LOADED && !refresh)
    ) {
      return;
    }

    setStatus(Status.LOADING, section);

    const { awaitTask } = useTasks();
    try {
      const taskType = TaskType.DEFI_BALANCES;
      const { taskId } = await api.defi.fetchAllDefi();
      const { result } = await awaitTask<AllDefiProtocols, TaskMeta>(
        taskId,
        taskType,
        {
          title: i18n.tc('actions.defi.balances.task.title'),
          numericKeys: balanceKeys
        }
      );

      commit('allDefiProtocols', result);
    } catch (e: any) {
      const title = i18n.tc('actions.defi.balances.error.title');
      const message = i18n.tc(
        'actions.defi.balances.error.description',
        undefined,
        { error: e.message }
      );
      const { notify } = useNotifications();
      notify({
        title,
        message,
        display: true
      });
    }
    setStatus(Status.LOADED, section);
  },

  async fetchAllDefi({ dispatch }, refresh: boolean = false) {
    const section = Section.DEFI_OVERVIEW;
    const currentStatus = getStatus(section);
    if (
      isLoading(currentStatus) ||
      (currentStatus === Status.LOADED && !refresh)
    ) {
      return;
    }

    const newStatus = refresh ? Status.REFRESHING : Status.LOADING;
    setStatus(newStatus, section);
    await dispatch('fetchDefiBalances', refresh);
    setStatus(Status.PARTIALLY_LOADED, section);

    const { fetchBalances: fetchLiquityBalances } = useLiquityStore();
    const { fetchBalances: fetchYearnBalances } = useYearnStore();
    const { fetchBalances: fetchAaveBalances } = useAaveStore();
    const { fetchBalances: fetchCompoundBalances } = useCompoundStore();
    const { fetchDSRBalances, fetchMakerDAOVaults } = useMakerDaoStore();

    await Promise.allSettled([
      fetchAaveBalances(refresh),
      fetchDSRBalances(refresh),
      fetchMakerDAOVaults(refresh),
      fetchCompoundBalances(refresh),
      fetchYearnBalances({
        refresh,
        version: ProtocolVersion.V1
      }),
      fetchYearnBalances({
        refresh,
        version: ProtocolVersion.V2
      }),
      fetchLiquityBalances(refresh)
    ]);

    setStatus(Status.LOADED, section);
  },

  async fetchLending({ rootState: { session } }, refresh?: boolean) {
    const premium = session?.premium;
    const section = Section.DEFI_LENDING;
    const premiumSection = Section.DEFI_LENDING_HISTORY;
    const currentStatus = getStatus(section);

    const newStatus = refresh ? Status.REFRESHING : Status.LOADING;
    const { fetchBalances: fetchYearnBalances } = useYearnStore();
    const { fetchBalances: fetchAaveBalances } = useAaveStore();
    const { fetchBalances: fetchCompoundBalances } = useCompoundStore();
    const { fetchDSRBalances } = useMakerDaoStore();

    if (
      !isLoading(currentStatus) ||
      (currentStatus === Status.LOADED && refresh)
    ) {
      setStatus(newStatus, section);

      await Promise.allSettled([
        fetchDSRBalances(refresh).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        }),
        fetchAaveBalances(refresh).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        }),
        fetchCompoundBalances(refresh).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        }),
        fetchYearnBalances({
          refresh: refresh ?? false,
          version: ProtocolVersion.V1
        }).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        }),
        fetchYearnBalances({
          refresh: refresh ?? false,
          version: ProtocolVersion.V2
        }).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        })
      ]);

      setStatus(Status.LOADED, section);
    }

    const currentPremiumStatus = getStatus(premiumSection);

    if (
      !premium ||
      isLoading(currentPremiumStatus) ||
      (currentPremiumStatus === Status.LOADED && !refresh)
    ) {
      return;
    }

    setStatus(newStatus, premiumSection);

    const { fetchHistory: fetchYearnHistory } = useYearnStore();
    const { fetchHistory: fetchAaveHistory } = useAaveStore();
    const { fetchHistory: fetchCompoundHistory } = useCompoundStore();
    const { fetchDSRHistory } = useMakerDaoStore();

    await Promise.all([
      fetchDSRHistory(refresh),
      fetchAaveHistory({ refresh }),
      fetchCompoundHistory(refresh),
      fetchYearnHistory({
        refresh: refresh ?? false,
        version: ProtocolVersion.V1
      }),
      fetchYearnHistory({
        refresh: refresh ?? false,
        version: ProtocolVersion.V2
      })
    ]);

    setStatus(Status.LOADED, premiumSection);
  },

  async resetDB(_, protocols: DefiProtocol[]) {
    const premiumSection = Section.DEFI_LENDING_HISTORY;
    const currentPremiumStatus = getStatus(premiumSection);
    const premium = getPremium();

    if (!get(premium) || isLoading(currentPremiumStatus)) {
      return;
    }

    setStatus(Status.REFRESHING, premiumSection);

    const toReset: Promise<void>[] = [];
    const { fetchHistory: fetchYearnVaultsHistory } = useYearnStore();
    if (protocols.includes(DefiProtocol.YEARN_VAULTS)) {
      toReset.push(
        fetchYearnVaultsHistory({
          refresh: true,
          reset: true,
          version: ProtocolVersion.V1
        })
      );
    }

    if (protocols.includes(DefiProtocol.YEARN_VAULTS_V2)) {
      toReset.push(
        fetchYearnVaultsHistory({
          refresh: true,
          reset: true,
          version: ProtocolVersion.V2
        })
      );
    }

    if (protocols.includes(DefiProtocol.AAVE)) {
      const { fetchHistory: fetchAaveHistory } = useAaveStore();
      toReset.push(fetchAaveHistory({ refresh: true, reset: true }));
    }

    await Promise.all(toReset);

    setStatus(Status.LOADED, premiumSection);
  },

  async fetchBorrowing({ rootState: { session } }, refresh: boolean = false) {
    const premium = session?.premium;
    const section = Section.DEFI_BORROWING;
    const premiumSection = Section.DEFI_BORROWING_HISTORY;
    const currentStatus = getStatus(section);
    const newStatus = refresh ? Status.REFRESHING : Status.LOADING;

    const { fetchBalances: fetchAaveBalances, fetchHistory: fetchAaveHistory } =
      useAaveStore();
    const {
      fetchBalances: fetchLiquityBalances,
      fetchEvents: fetchLiquityEvents
    } = useLiquityStore();
    const {
      fetchBalances: fetchCompoundBalances,
      fetchHistory: fetchCompoundHistory
    } = useCompoundStore();
    const { fetchMakerDAOVaults, fetchMakerDAOVaultDetails } =
      useMakerDaoStore();

    if (
      !isLoading(currentStatus) ||
      (currentStatus === Status.LOADED && refresh)
    ) {
      setStatus(newStatus, section);
      await Promise.all([
        fetchMakerDAOVaults(refresh).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        }),
        fetchCompoundBalances(refresh).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        }),
        fetchAaveBalances(refresh).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        }),
        fetchLiquityBalances(refresh).then(() => {
          setStatus(Status.PARTIALLY_LOADED, section);
        })
      ]);

      setStatus(Status.LOADED, section);
    }

    const currentPremiumStatus = getStatus(premiumSection);

    if (
      !premium ||
      isLoading(currentPremiumStatus) ||
      (currentPremiumStatus === Status.LOADED && !refresh)
    ) {
      return;
    }

    setStatus(newStatus, premiumSection);

    await Promise.all([
      fetchMakerDAOVaultDetails(refresh),
      fetchCompoundHistory(refresh),
      fetchAaveHistory({ refresh }),
      fetchLiquityEvents(refresh)
    ]);

    setStatus(Status.LOADED, premiumSection);
  },

  async fetchAirdrops({ commit }, refresh: boolean = false) {
    const section = Section.DEFI_AIRDROPS;
    const currentStatus = getStatus(section);

    if (
      isLoading(currentStatus) ||
      (currentStatus === Status.LOADED && !refresh)
    ) {
      return;
    }

    const newStatus = refresh ? Status.REFRESHING : Status.LOADING;
    setStatus(newStatus, section);
    const { awaitTask } = useTasks();

    try {
      const { taskId } = await api.airdrops();
      const { result } = await awaitTask<Airdrops, TaskMeta>(
        taskId,
        TaskType.DEFI_AIRDROPS,
        {
          title: i18n.t('actions.defi.airdrops.task.title').toString(),
          numericKeys: balanceKeys
        }
      );

      commit('airdrops', result);
    } catch (e: any) {
      const { notify } = useNotifications();
      notify({
        title: i18n.t('actions.defi.airdrops.error.title').toString(),
        message: i18n
          .t('actions.defi.airdrops.error.description', {
            error: e.message
          })
          .toString(),
        display: true
      });
    }
    setStatus(Status.LOADED, section);
  },

  async [ACTION_PURGE_PROTOCOL](
    { commit, dispatch },
    module: Module | typeof ALL_MODULES
  ) {
    const { resetStatus } = getStatusUpdater(Section.DEFI_DSR_BALANCES);
    const { reset: resetYearn } = useYearnStore();
    const { reset: resetBalancer } = useBalancerStore();
    const { reset: resetAave } = useAaveStore();
    const { reset: resetCompound } = useCompoundStore();
    const { reset: resetMakerDao } = useMakerDaoStore();

    function clearUniswapState() {
      commit('uniswapBalances', {});
      commit('uniswapTrades', {});
      commit('uniswapEvents', {});

      resetStatus(Section.DEFI_UNISWAP_BALANCES);
      resetStatus(Section.DEFI_UNISWAP_TRADES);
      resetStatus(Section.DEFI_UNISWAP_EVENTS);
    }

    if (module === Module.MAKERDAO_DSR) {
      resetMakerDao(module);
    } else if (module === Module.MAKERDAO_VAULTS) {
      resetMakerDao(module);
    } else if (module === Module.AAVE) {
      resetAave();
    } else if (module === Module.COMPOUND) {
      resetCompound();
    } else if (module === Module.YEARN) {
      resetYearn(ProtocolVersion.V1);
    } else if (module === Module.YEARN_V2) {
      resetYearn(ProtocolVersion.V2);
    } else if (module === Module.UNISWAP) {
      clearUniswapState();
    } else if (module === Module.BALANCER) {
      resetBalancer();
    } else if (Module.SUSHISWAP) {
      dispatch('sushiswap/purge');
    } else if (Module.LIQUITY) {
      useLiquityStore().purge();
    } else if (module === ALL_MODULES) {
      resetMakerDao();
      resetAave();
      resetCompound();
      resetYearn();
      clearUniswapState();
      resetBalancer();
    }
  }
};
