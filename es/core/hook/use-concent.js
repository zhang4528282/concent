import React from 'react';
import { CC_HOOK_PREFIX } from '../../support/constant';
import buildRefCtx from '../ref/build-ref-ctx';
import ccContext from '../../cc-context';
import mapRegistrationInfo from '../base/map-registration-info';
import beforeMount from '../base/before-mount';
import didMount from '../base/did-mount';
import didUpdate from '../base/did-update';
import beforeUnmount from '../base/before-unmount';
import getStoredKeys from '../base/get-stored-keys';
import { isPlainJsonObject, getRegisterOptions } from '../../support/util';

const { ccUkey_ref_, moduleName_stateKeys_ } = ccContext;

let refCursor = 1;
const cursor_refKey_ = {};

function getUsableCursor() {
  return refCursor;
}
function incCursor() {
  refCursor = refCursor + 1;
}

const makeSetState = (ccHookState, hookSetState) => (partialState, cb) => {
  ccHookState.state = Object.assign({}, ccHookState.state, partialState);
  const newHookState = Object.assign({}, ccHookState);
  hookSetState(newHookState);

  // 和class setState(partialState, cb); 保持一致
  if (cb) cb(newHookState);
}
const makeForceUpdate = (ccHookState, hookSetState) => cb => {
  const newHookState = Object.assign({}, ccHookState);
  hookSetState(newHookState);
  if (cb) cb(newHookState);
}

function CcHook(ccHookState, hookSetState, props) {
  this.setState = makeSetState(ccHookState, hookSetState);
  this.forceUpdate = makeForceUpdate(ccHookState, hookSetState);
  this.state = ccHookState.state;
  this.isFirstRendered = true;
  this.props = props;
}

//写为具名函数，防止react devtoo里显示.default
export default function useConcent(registerOption, ccClassKey){
  const _registerOption = getRegisterOptions(registerOption);
  const { state = {}, props = {}, mapProps } = _registerOption;
  const reactUseState = React.useState;
  if (!reactUseState) {
    throw new Error('make sure your react version is LTE 16.8');
  }

  const cursor = getUsableCursor();
  const [ccHookState, hookSetState] = reactUseState({ cursor, state });
  const nowCursor = ccHookState.cursor;

  const isFirstRendered = nowCursor === cursor;
  let hookRef;
  if (isFirstRendered) {
    const {
      renderKeyClasses, module, reducerModule, watchedKeys = '*', storedKeys = [],
      persistStoredKeys, connect = {}, setup, bindCtxToMethod, lite
    } = _registerOption;

    incCursor();
    const { _module, _reducerModule, _watchedKeys, _ccClassKey, _connect } = mapRegistrationInfo(
      module, ccClassKey, renderKeyClasses, CC_HOOK_PREFIX, watchedKeys, storedKeys, connect, reducerModule, true
    );
    hookRef = new CcHook(ccHookState, hookSetState, props);

    const ccOption = props.ccOption || { persistStoredKeys };
    const _storedKeys = getStoredKeys(state, moduleName_stateKeys_[_module], ccOption.storedKeys, storedKeys);
    const params = Object.assign({}, _registerOption, {
      module: _module, reducerModule: _reducerModule, watchedKeys: _watchedKeys, type: CC_HOOK_PREFIX,
      ccClassKey: _ccClassKey, connect: _connect, ccOption, storedKeys: _storedKeys, lite
    });

    buildRefCtx(hookRef, params, lite);
    beforeMount(hookRef, setup, bindCtxToMethod);
    cursor_refKey_[nowCursor] = hookRef.ctx.ccUniqueKey;
  } else {
    const refKey = cursor_refKey_[nowCursor];
    hookRef = ccUkey_ref_[refKey];

    const refCtx = hookRef.ctx;
    //existing period, replace reactSetState and reactForceUpdate
    refCtx.reactSetState = makeSetState(ccHookState, hookSetState);
    refCtx.reactForceUpdate = makeForceUpdate(ccHookState, hookSetState);
  }
  
  const refCtx = hookRef.ctx;
  refCtx.props = props;

  // ???does user really need beforeMount,mounted,beforeUpdate,updated,beforeUnmount in setup???

  //after every render
  React.useEffect(() => {
    if (!hookRef.isFirstRendered) {// mock componentDidUpdate
      didUpdate(hookRef);
    }
  });

  //after first render
  React.useEffect(() => {// mock componentDidMount
    hookRef.isFirstRendered = false;
    didMount(hookRef);

    return () => {// mock componentWillUnmount
      beforeUnmount(hookRef);
    }
  }, []);

  // before every render
  if (mapProps) {
    const mapped = mapProps(refCtx);
    if (!isPlainJsonObject(mapped)) {
      throw new Error('mapProps must return an plain json object')
    }
    refCtx.mapped = mapped;
  }

  return refCtx;
}
