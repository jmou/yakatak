<script setup lang="ts">
// Doesn't provide any type safety but clarifies intention.
type OptionValue = unknown;

const state = reactive({
  title: "",
  labels: [] as string[],
  values: null as OptionValue[] | null,
  selectedIndex: -1,
});

const elem = useTemplateRef("elem");

type ResolveFunction = (value: OptionValue | null) => void;
let resolveAsk: ResolveFunction | null = null;

onMounted(() => {
  elem.value!.addEventListener("cancel", () => {
    state.selectedIndex = -1;
  });

  elem.value!.addEventListener("close", () => {
    if (resolveAsk) {
      if (state.selectedIndex < 0) {
        resolveAsk(null);
      } else if (state.values) {
        resolveAsk(state.values[state.selectedIndex]);
      } else {
        resolveAsk(state.selectedIndex);
      }
      resolveAsk = null;
    }
  });
});

function onClickLabel(event: PointerEvent) {
  // Are we actually a keyboard "click"?
  // See https://stackoverflow.com/a/35034284/13773246
  if (event.clientX === 0 && event.clientY === 0) return;
  elem.value!.close();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "j") {
    state.selectedIndex =
      state.selectedIndex + 1 < state.labels.length ? state.selectedIndex + 1 : 0;
    event.preventDefault();
  } else if (event.key === "k") {
    state.selectedIndex =
      state.selectedIndex > 0 ? state.selectedIndex - 1 : Math.max(0, state.labels.length - 1);
    event.preventDefault();
  }
}

/**
 * Present to the user a dialog for choosing among the provided labels.
 * @param title Dialog title
 * @param labels Display texts for the user to choose among
 * @returns The index of the user's choice
 */
function ask(title: string, labels: string[]): Promise<number | null>;
/**
 * Present to the user a dialog for choosing among the provided labels.
 * @param title Dialog title
 * @param labels Display texts for the user to choose among
 * @param values Values corresponding to `labels`
 * @returns The value at the index of the user's choice
 */
function ask<T>(title: string, labels: string[], values: T[]): Promise<T | null>;
function ask<T = number>(title: string, labels: string[], values?: T[]): Promise<T | null> {
  assert(values == null || labels.length === values.length);
  state.title = title;
  state.labels = labels;
  state.values = values ?? null;
  state.selectedIndex = 0;

  nextTick(() => {
    elem.value!.showModal();
    elem.value!.querySelector<HTMLElement>("input:checked")?.focus();
  });

  return new Promise((resolve) => (resolveAsk = resolve as ResolveFunction));
}

defineExpose({ ask });
</script>

<template>
  <dialog ref="elem" closedby="any" @keydown="onKeyDown">
    <header>{{ state.title }}</header>
    <form method="dialog">
      <label v-for="(label, i) in state.labels" :key="i" @click="onClickLabel">
        <input v-model="state.selectedIndex" type="radio" :value="i" />
        {{ label }}
      </label>
      <!-- Only exists to allow implicit form submission with Enter key -->
      <input type="submit" tabindex="-1" style="display: none" />
    </form>
  </dialog>
</template>

<style scoped>
dialog {
  margin-top: 2em;
  padding: 0;
  background: #ddd;
  border-radius: 8px;
  box-shadow: 0 0 6px #0004;
  border: 1px solid #333;

  > header {
    margin: 0 1em;
    padding: 0.7em 0.5em 0.3em;
    border-bottom: 1px solid #ccc;
    font-weight: bold;
  }

  > form {
    margin: 0.8em 1em 1em;
  }

  &::backdrop {
    background-color: #ddd5;
  }
}

label {
  display: block;
  padding: 0.5em;
  margin: 0.5em 0;
  background: #eee;
  border: 1px solid #888;
  border-radius: 8px;
  cursor: pointer;

  &:has(input:checked) {
    border-color: #38f;
    outline: 3px solid #acf;
  }
}

/* Hide but still support keyboard focusing. */
input[type="radio"] {
  position: absolute;
  opacity: 0;
}
</style>
