import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  onValue,
  push,
  set,
  update,
  remove,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvJ7DX5omMn-j81nPHjN171fQ39D6kNDE",
  authDomain: "haven-todo-backend.firebaseapp.com",
  databaseURL: "https://haven-todo-backend-default-rtdb.firebaseio.com",
  projectId: "haven-todo-backend",
  storageBucket: "haven-todo-backend.firebasestorage.app",
  messagingSenderId: "968881323696",
  appId: "1:968881323696:web:a471d3642f25a23a1d4575"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const nicknameScreen = document.querySelector("#nickname-screen");
const lobbyScreen = document.querySelector("#lobby-screen");
const roomScreen = document.querySelector("#room-screen");
const completeScreen = document.querySelector("#complete-screen");

const nicknameForm = document.querySelector("#nickname-form");
const nicknameInput = document.querySelector("#nickname-input");
const welcomeMessage = document.querySelector("#welcome-message");
const lobbyStatus = document.querySelector("#lobby-status");
const createRoomForm = document.querySelector("#create-room-form");
const roomNameInput = document.querySelector("#room-name-input");
const joinRoomForm = document.querySelector("#join-room-form");
const joinCodeInput = document.querySelector("#join-code-input");

const roomTitle = document.querySelector("#room-title");
const roomParticipantCount = document.querySelector("#room-participant-count");
const roomCodeLabel = document.querySelector("#room-code-label");
const roomNickname = document.querySelector("#room-nickname");
const editRoomNameBtn = document.querySelector("#edit-room-name-btn");
const backToLobbyBtn = document.querySelector("#back-to-lobby-btn");

const itemForm = document.querySelector("#item-form");
const itemInput = document.querySelector("#item-input");
const itemList = document.querySelector("#item-list");
const completeShoppingBtn = document.querySelector("#complete-shopping-btn");
const resetToStartBtn = document.querySelector("#reset-to-start-btn");
const completeCountdown = document.querySelector("#complete-countdown");

let currentScreen = "nickname";
let nickname = "";
let currentRoomCode = "";
let currentRoomName = "";
let roomUnsubs = [];
let myPresenceRef = null;
let latestItems = [];
let completeResetTimerId = null;
let completeCountdownTimerId = null;
let lastHandledCompletedAt = 0;
const clientId = createClientId();
const userProfileRef = ref(db, `appState/profiles/${clientId}`);
const userSessionRef = ref(db, `appState/sessions/${clientId}`);

const connectedRef = ref(db, ".info/connected");

initializeUI();

async function initializeUI() {
  showScreen("nickname");
  nicknameInput.value = "";
  setupUserPresence();

  await restoreUserStateFromFirebase();

  nicknameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const entered = nicknameInput.value.trim();
    if (!entered) {
      window.alert("닉네임을 입력해주세요.");
      return;
    }

    nickname = entered;
    welcomeMessage.textContent = `${nickname}님, 환영해요!`;
    await syncUserState("lobby");
    showScreen("lobby");
  });

  createRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const roomName = roomNameInput.value.trim() || "오늘의 장보기";

    try {
      const roomCode = await generateUniqueRoomCode();
      await set(ref(db, `shoppingLists/${roomCode}/meta`), {
        roomName,
        createdBy: nickname,
        createdAt: Date.now()
      });
      roomNameInput.value = "";
      await enterRoom(roomCode);
    } catch (error) {
      window.alert("룸 생성에 실패했습니다.");
      console.error(error);
    }
  });

  joinRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const roomCode = sanitizeRoomCode(joinCodeInput.value);
    if (!roomCode) {
      window.alert("올바른 코드 형식이 아닙니다. (영문/숫자, 최대 5자)");
      return;
    }

    const roomSnap = await get(ref(db, `shoppingLists/${roomCode}/meta`));
    if (!roomSnap.exists()) {
      window.alert("존재하지 않는 룸 코드입니다.");
      return;
    }

    joinCodeInput.value = "";
    await enterRoom(roomCode);
  });

  backToLobbyBtn.addEventListener("click", async () => {
    await leaveCurrentRoom();
    await syncUserState("lobby");
    showScreen("lobby");
  });

  itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentRoomCode) return;

    const name = itemInput.value.trim();
    if (!name) {
      window.alert("물건 이름을 입력해주세요.");
      return;
    }

    try {
      const itemsRef = ref(db, `shoppingLists/${currentRoomCode}/items`);
      const newItemRef = push(itemsRef);
      await update(newItemRef, {
        name,
        checked: false,
        createdBy: nickname,
        checkedBy: "",
        createdAt: Date.now()
      });
      itemInput.value = "";
      itemInput.focus();
    } catch (error) {
      window.alert("아이템 저장에 실패했습니다.");
      console.error(error);
    }
  });

  editRoomNameBtn.addEventListener("click", async () => {
    if (!currentRoomCode) return;
    const nextName = window.prompt("새 룸 이름을 입력하세요.", currentRoomName || "");
    if (nextName === null) return;

    const trimmed = nextName.trim();
    if (!trimmed) {
      window.alert("룸 이름은 비워둘 수 없습니다.");
      return;
    }

    try {
      await update(ref(db, `shoppingLists/${currentRoomCode}/meta`), {
        roomName: trimmed
      });
    } catch (error) {
      window.alert("룸 이름 수정에 실패했습니다.");
      console.error(error);
    }
  });

  completeShoppingBtn.addEventListener("click", async () => {
    if (!isChecklistCompleted(latestItems)) return;
    if (!currentRoomCode) return;

    const roomMetaRef = ref(db, `shoppingLists/${currentRoomCode}/meta`);
    await update(roomMetaRef, {
      isCompleted: true,
      completedAt: Date.now(),
      completedBy: nickname
    });
  });

  resetToStartBtn.addEventListener("click", async () => {
    await resetToStart();
  });
}

function renderItems(items) {
  latestItems = items;
  itemList.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "아직 장보기 항목이 없습니다.";
    itemList.appendChild(empty);
    updateCompleteButton(items);
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.className = `item${item.checked ? " checked" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(item.checked);
    checkbox.addEventListener("change", () => toggleChecked(item.id, checkbox.checked));

    const main = document.createElement("div");
    main.className = "item-main";

    const name = document.createElement("p");
    name.className = "item-name";
    name.textContent = `${getItemEmoji(item.name)} ${item.name || "(이름 없음)"}`;

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = item.checked
      ? `작성: ${item.createdBy || "unknown"} · 체크: ${item.checkedBy || "unknown"}`
      : `작성: ${item.createdBy || "unknown"}`;

    main.append(name, meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", () => deleteItem(item.id));

    const right = document.createElement("div");
    right.className = "item-right";

    const time = document.createElement("p");
    time.className = "item-time";
    time.textContent = formatItemTime(item.createdAt);

    right.append(time, deleteBtn);

    li.append(checkbox, main, right);
    itemList.appendChild(li);
  }

  updateCompleteButton(items);
}

function showScreen(screenName) {
  currentScreen = screenName;

  nicknameScreen.classList.remove("active");
  lobbyScreen.classList.remove("active");
  roomScreen.classList.remove("active");
  completeScreen.classList.remove("active");

  if (screenName === "nickname") nicknameScreen.classList.add("active");
  if (screenName === "lobby") {
    lobbyScreen.classList.add("active");
    cleanupEmptyRooms();
  }
  if (screenName === "room") roomScreen.classList.add("active");
  if (screenName === "complete") completeScreen.classList.add("active");
}

async function enterRoom(roomCode) {
  if (currentRoomCode) {
    await leaveCurrentRoom();
  }

  currentRoomCode = roomCode;
  lastHandledCompletedAt = 0;
  clearCompleteResetTimer();
  roomNickname.textContent = `닉네임: ${nickname}`;
  roomParticipantCount.textContent = "오늘의 장보기에 참여 중: 0명";
  roomCodeLabel.textContent = `초대 코드: ${currentRoomCode}`;
  itemList.innerHTML = "";
  completeShoppingBtn.classList.add("is-hidden");
  await syncUserState("room", { roomCode: currentRoomCode });
  showScreen("room");

  const itemsRef = ref(db, `shoppingLists/${currentRoomCode}/items`);
  const metaRef = ref(db, `shoppingLists/${currentRoomCode}/meta`);
  const presenceRef = ref(db, `shoppingLists/${currentRoomCode}/presence`);

  const unsubMeta = onValue(metaRef, (snapshot) => {
    const meta = snapshot.val() || {};
    currentRoomName = meta.roomName || "오늘의 장보기";
    roomTitle.textContent = currentRoomName;

    if (meta.isCompleted && meta.completedAt && meta.completedAt !== lastHandledCompletedAt) {
      handleRoomCompleted(meta.completedAt);
    }
  });

  const unsubItems = onValue(itemsRef, (snapshot) => {
    const data = snapshot.val() || {};
    const items = Object.entries(data)
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    renderItems(items);
  });

  const unsubConnected = onValue(connectedRef, async (snapshot) => {
    if (!snapshot.val()) {
      myPresenceRef = null;
      return;
    }
    if (!currentRoomCode || myPresenceRef) return;

    myPresenceRef = push(ref(db, `shoppingLists/${currentRoomCode}/presence`));
    await set(myPresenceRef, {
      nickname,
      joinedAt: Date.now()
    });
    onDisconnect(myPresenceRef).remove();
  });

  const unsubPresenceCount = onValue(presenceRef, (snapshot) => {
    const presenceData = snapshot.val() || {};
    const participantCount = Object.keys(presenceData).length;
    roomParticipantCount.textContent = `오늘의 장보기에 참여 중: ${participantCount}명`;
  });

  roomUnsubs = [unsubMeta, unsubItems, unsubConnected, unsubPresenceCount];
}

async function leaveCurrentRoom() {
  roomUnsubs.forEach((unsub) => unsub());
  roomUnsubs = [];

  if (!currentRoomCode) return;

  const roomCode = currentRoomCode;
  const roomRef = ref(db, `shoppingLists/${roomCode}`);
  const presenceRef = ref(db, `shoppingLists/${roomCode}/presence`);

  try {
    if (myPresenceRef) {
      await remove(myPresenceRef);
      myPresenceRef = null;
    }

    const presenceSnap = await get(presenceRef);
    if (!presenceSnap.exists()) {
      await remove(roomRef);
    }
  } catch (error) {
    console.error(error);
  } finally {
    clearCompleteResetTimer();
    clearCompleteCountdownTimer();
    currentRoomCode = "";
    currentRoomName = "";
    roomTitle.textContent = "오늘의 장보기";
    roomParticipantCount.textContent = "오늘의 장보기에 참여 중: 0명";
    roomCodeLabel.textContent = "";
    latestItems = [];
    completeShoppingBtn.classList.add("is-hidden");
  }
}

async function toggleChecked(itemId, checked) {
  if (!currentRoomCode) return;
  const itemRef = ref(db, `shoppingLists/${currentRoomCode}/items/${itemId}`);
  try {
    await update(itemRef, {
      checked,
      checkedBy: checked ? nickname : ""
    });
  } catch (error) {
    window.alert("체크 상태 변경에 실패했습니다.");
    console.error(error);
  }
}

async function deleteItem(itemId) {
  if (!currentRoomCode) return;
  const itemRef = ref(db, `shoppingLists/${currentRoomCode}/items/${itemId}`);
  try {
    await remove(itemRef);
  } catch (error) {
    window.alert("삭제에 실패했습니다.");
    console.error(error);
  }
}

function sanitizeRoomCode(value) {
  const cleaned = (value || "").trim().replace(/[^a-zA-Z0-9]/g, "");
  if (!cleaned || cleaned.length > 5) return "";
  return cleaned;
}

async function generateUniqueRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const maxTry = 40;

  for (let i = 0; i < maxTry; i += 1) {
    let code = "";
    for (let j = 0; j < 5; j += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const hasUpper = /[A-Z]/.test(code);
    const hasLower = /[a-z]/.test(code);
    const hasDigit = /[0-9]/.test(code);
    if (!hasUpper || !hasLower || !hasDigit) continue;

    const snap = await get(ref(db, `shoppingLists/${code}`));
    if (!snap.exists()) return code;
  }

  throw new Error("고유한 룸 코드를 생성하지 못했습니다.");
}

async function cleanupEmptyRooms() {
  const rootSnap = await get(ref(db, "shoppingLists"));
  const rooms = rootSnap.val() || {};

  for (const [code, room] of Object.entries(rooms)) {
    const presence = room?.presence || {};
    if (Object.keys(presence).length === 0) {
      await remove(ref(db, `shoppingLists/${code}`));
    }
  }
}

function setupUserPresence() {
  onValue(connectedRef, async (snapshot) => {
    const connected = snapshot.val();
    if (!connected) return;

    await update(userSessionRef, {
      nickname: nickname || "",
      screen: currentScreen,
      roomCode: currentRoomCode || "",
      connected: true,
      updatedAt: Date.now()
    });
    onDisconnect(userSessionRef).remove();
  });
}

async function syncUserState(screen, options = {}) {
  const roomCode = options.roomCode || "";
  await update(userProfileRef, {
    nickname: nickname || "",
    lastScreen: screen,
    lastRoomCode: roomCode,
    updatedAt: Date.now()
  });

  await update(userSessionRef, {
    nickname: nickname || "",
    screen,
    roomCode,
    connected: true,
    updatedAt: Date.now()
  });
}

function createClientId() {
  const prefix = "shopping-client:";
  if (window.name && window.name.startsWith(prefix)) {
    return window.name.slice(prefix.length);
  }

  const nextId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  window.name = `${prefix}${nextId}`;
  return nextId;
}

async function restoreUserStateFromFirebase() {
  try {
    const profileSnap = await get(userProfileRef);
    if (!profileSnap.exists()) {
      showScreen("nickname");
      return;
    }

    const profile = profileSnap.val() || {};
    nickname = (profile.nickname || "").trim();
    if (!nickname) {
      showScreen("nickname");
      return;
    }

    welcomeMessage.textContent = `${nickname}님, 다시 돌아왔어요!`;
    nicknameInput.value = nickname;

    const lastScreen = profile.lastScreen || "lobby";
    const lastRoomCode = sanitizeRoomCode(profile.lastRoomCode || "");

    if (lastScreen === "room" && lastRoomCode) {
      const roomMetaSnap = await get(ref(db, `shoppingLists/${lastRoomCode}/meta`));
      if (roomMetaSnap.exists()) {
        await enterRoom(lastRoomCode);
        return;
      }
    }

    if (lastScreen === "complete" && lastRoomCode) {
      const roomMetaSnap = await get(ref(db, `shoppingLists/${lastRoomCode}/meta`));
      if (roomMetaSnap.exists()) {
        await enterRoom(lastRoomCode);
        showScreen("complete");
        return;
      }
    }

    showScreen("lobby");
  } catch (error) {
    console.error(error);
    showScreen("nickname");
  }
}

function updateCompleteButton(items) {
  if (isChecklistCompleted(items)) {
    completeShoppingBtn.classList.remove("is-hidden");
  } else {
    completeShoppingBtn.classList.add("is-hidden");
  }
}

function isChecklistCompleted(items) {
  return items.length > 0 && items.every((item) => Boolean(item.checked));
}

function getItemEmoji(name = "") {
  const value = String(name).toLowerCase();
  if (value.includes("우유") || value.includes("milk")) return "🥛";
  if (value.includes("달걀") || value.includes("계란") || value.includes("egg")) return "🥚";
  if (value.includes("사과") || value.includes("apple")) return "🍎";
  if (value.includes("빵") || value.includes("bread")) return "🍞";
  if (value.includes("고기") || value.includes("meat")) return "🥩";
  if (value.includes("물") || value.includes("water")) return "💧";
  if (value.includes("바나나") || value.includes("banana")) return "🍌";
  if (value.includes("치즈") || value.includes("cheese")) return "🧀";
  if (value.includes("쌀") || value.includes("rice")) return "🍚";
  return "🛒";
}

function formatItemTime(timestamp) {
  if (!timestamp) return "--:--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit"
  });
}

async function resetToStart() {
  clearCompleteResetTimer();
  clearCompleteCountdownTimer();

  if (currentRoomCode) {
    await leaveCurrentRoom();
  }

  nickname = "";
  welcomeMessage.textContent = "";
  lobbyStatus.textContent = "";
  nicknameInput.value = "";
  latestItems = [];
  completeShoppingBtn.classList.add("is-hidden");

  await remove(userProfileRef);
  await update(userSessionRef, {
    nickname: "",
    screen: "nickname",
    roomCode: "",
    connected: true,
    updatedAt: Date.now()
  });

  showScreen("nickname");
}

function handleRoomCompleted(completedAt) {
  lastHandledCompletedAt = completedAt;
  syncUserState("complete", { roomCode: currentRoomCode });
  showScreen("complete");
  clearCompleteResetTimer();
  clearCompleteCountdownTimer();

  let secondsLeft = 5;
  completeCountdown.textContent = `${secondsLeft}초 후 자동으로 처음 화면으로 이동합니다.`;
  completeCountdownTimerId = window.setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) {
      completeCountdown.textContent = `${secondsLeft}초 후 자동으로 처음 화면으로 이동합니다.`;
    } else {
      completeCountdown.textContent = "곧 처음 화면으로 이동합니다...";
      clearCompleteCountdownTimer();
    }
  }, 1000);

  completeResetTimerId = window.setTimeout(async () => {
    await resetToStart();
  }, 5000);
}

function clearCompleteResetTimer() {
  if (completeResetTimerId) {
    window.clearTimeout(completeResetTimerId);
    completeResetTimerId = null;
  }
}

function clearCompleteCountdownTimer() {
  if (completeCountdownTimerId) {
    window.clearInterval(completeCountdownTimerId);
    completeCountdownTimerId = null;
  }
}

