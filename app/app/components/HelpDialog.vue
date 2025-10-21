<script setup lang="ts">
const elem = useTemplateRef("elem");

function show() {
  elem.value!.showModal();
}

function close() {
  elem.value!.close();
}

defineExpose({ show });
</script>

<template>
  <dialog ref="elem" closedby="any" @click.self="close">
    <header>Keyboard Shortcuts</header>
    <div class="help-content">
      <section>
        <h3>Navigation</h3>
        <dl>
          <dt><kbd>h</kbd></dt>
          <dd>Pick card to the left</dd>
          <dt><kbd>l</kbd></dt>
          <dd>Pick card to the right</dd>
          <dt><kbd>j</kbd></dt>
          <dd>Activate pile below</dd>
          <dt><kbd>k</kbd></dt>
          <dd>Activate pile above</dd>
          <dt><kbd>^</kbd></dt>
          <dd>Pick first card in pile</dd>
          <dt><kbd>$</kbd></dt>
          <dd>Pick last card in pile</dd>
        </dl>
      </section>

      <section>
        <h3>Card Manipulation</h3>
        <dl>
          <dt><kbd>H</kbd></dt>
          <dd>Swap picked card with left neighbor</dd>
          <dt><kbd>L</kbd></dt>
          <dd>Swap picked card with right neighbor</dd>
          <dt><kbd>1</kbd>-<kbd>9</kbd>, <kbd>0</kbd></dt>
          <dd>Move picked card to pile (1-10)</dd>
          <dt><kbd>d</kbd></dt>
          <dd>Discard picked card</dd>
          <dt><kbd>Enter</kbd></dt>
          <dd>Open picked card page</dd>
        </dl>
      </section>

      <section>
        <h3>Pile Management</h3>
        <dl>
          <dt><kbd>J</kbd></dt>
          <dd>Swap active pile down</dd>
          <dt><kbd>K</kbd></dt>
          <dd>Swap active pile up</dd>
          <dt><kbd>o</kbd></dt>
          <dd>Create pile below</dd>
          <dt><kbd>O</kbd></dt>
          <dd>Create pile above</dd>
          <dt><kbd>n</kbd></dt>
          <dd>Name active pile</dd>
          <dt><kbd>g</kbd></dt>
          <dd>Go to chosen pile</dd>
          <dt><kbd>R</kbd></dt>
          <dd>Reverse cards in pile</dd>
        </dl>
      </section>

      <section>
        <h3>History & Snapshots</h3>
        <dl>
          <dt><kbd>u</kbd></dt>
          <dd>Undo last operation</dd>
          <dt><kbd>U</kbd></dt>
          <dd>Redo operation</dd>
          <dt><kbd>s</kbd></dt>
          <dd>Take snapshot</dd>
          <dt><kbd>S</kbd></dt>
          <dd>Restore snapshot</dd>
        </dl>
      </section>

      <section>
        <h3>Help</h3>
        <dl>
          <dt><kbd>?</kbd></dt>
          <dd>Show this help dialog</dd>
        </dl>
      </section>
    </div>
    <div class="dialog-footer">
      <button @click="close" autofocus>Close</button>
    </div>
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
  max-width: 700px;
  max-height: 80vh;

  > header {
    margin: 0 1em;
    padding: 0.7em 0.5em 0.3em;
    border-bottom: 1px solid #ccc;
    font-weight: bold;
    font-size: 1.2em;
  }

  &::backdrop {
    background-color: #ddd5;
  }
}

.help-content {
  margin: 1em;
  overflow-y: auto;
  max-height: calc(80vh - 8em);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5em;
}

section {
  h3 {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    font-weight: bold;
    color: #333;
  }
}

dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.4em 0.8em;
  align-items: baseline;
}

dt {
  font-weight: normal;
  text-align: right;
}

dd {
  margin: 0;
  color: #444;
}

kbd {
  display: inline-block;
  padding: 0.1em 0.4em;
  background: #f5f5f5;
  border: 1px solid #999;
  border-radius: 3px;
  box-shadow: 0 1px 0 #888;
  font-family: monospace;
  font-size: 0.9em;
  min-width: 1.5em;
  text-align: center;
}

.dialog-footer {
  margin: 0 1em 1em;
  padding-top: 1em;
  border-top: 1px solid #ccc;
  text-align: right;

  button {
    padding: 0.5em 1.5em;
    background: #4a90e2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;

    &:hover {
      background: #357abd;
    }

    &:focus {
      outline: 2px solid #38f;
      outline-offset: 2px;
    }
  }
}
</style>
