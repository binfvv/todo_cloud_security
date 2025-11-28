import {
  auth,
  db,
  provider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  ref,
  push,
  onValue,
  remove,
  update,
} from "./firebase-config.js";

// ==========================================
// 1. DOM ELEMENTS SELECTION
// ==========================================

// Auth & Container
const authOverlay = document.getElementById("authOverlay");
const appContainer = document.getElementById("appContainer");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

// Main App Navigation
const searchInput = document.getElementById("searchInput");
const filterBtns = document.querySelectorAll(".filter-btn");
const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");

// Quick Add Form
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const descInput = document.getElementById("descInput");
const dateInput = document.getElementById("dateInput");
const priorityInput = document.getElementById("priorityInput");
const alertInput = document.getElementById("alertInput");
const cancelBtn = document.getElementById("cancelBtn");
const confirmBtn = document.getElementById("addTaskConfirm");
const openBtns = document.querySelectorAll("#openTaskForm, #openTaskFormEmpty");

// Detail Modal
const detailOverlay = document.getElementById("detailModalOverlay");
const closeDetailBtn = document.getElementById("closeDetailBtn");
const saveDetailBtn = document.getElementById("saveDetailBtn");
const detailTitle = document.getElementById("detailTitle");
const detailDesc = document.getElementById("detailDesc");
const detailCheckbox = document.getElementById("detailCheckbox");
const detailSubtaskList = document.getElementById("detailSubtaskList");
const addDetailSubtaskBtn = document.getElementById("addDetailSubtaskBtn");
const detailDate = document.getElementById("detailDate");
const detailPriority = document.getElementById("detailPriority");
const detailAlert = document.getElementById("detailAlert");
const commentInput = document.querySelector(".comment-field");
const detailCommentsSection = document.querySelector(".detail-comments");

// Notifications
const notifBtn = document.getElementById("notifBtn");
const notifBadge = document.getElementById("notifBadge");
const notifPanel = document.getElementById("notifPanel");
const notifList = document.getElementById("notifList");
const clearNotifBtn = document.getElementById("clearNotifBtn");

// Toast Container
const toastContainer = document.createElement("div");
toastContainer.id = "toast-container";
document.body.appendChild(toastContainer);

// ==========================================
// 2. GLOBAL STATE
// ==========================================
let currentUser = null;
let globalTasks = {};
let currentFilter = "all";

// State cho Modal chi tiết
let currentDetailId = null;
let detailSubtasksBuffer = [];

const PRIORITY_SCORE = { urgent: 4, high: 3, normal: 2, low: 1 };

// ==========================================
// 3. UTILITY FUNCTIONS
// ==========================================

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${
    type === "success" ? "✅" : "❌"
  }</span> ${message}`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function formatDateDisplay(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function getNiceDateHeader(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const dateStr = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  const dayName = date.toLocaleDateString("en-GB", { weekday: "long" });

  let relative = "";
  if (date.toDateString() === today.toDateString()) relative = " · Today";
  else if (date.toDateString() === tomorrow.toDateString())
    relative = " · Tomorrow";
  else if (date.toDateString() === yesterday.toDateString())
    relative = " · Yesterday";

  return `${dateStr}${relative} · ${dayName}`;
}

function getAlertLabel(minutes) {
  if (minutes == 0) return "Đúng giờ";
  if (minutes < 60) return `${minutes} phút`;
  if (minutes == 60) return "1 tiếng";
  if (minutes == 1440) return "1 ngày";
  return `${minutes} phút`;
}

function checkDateLogic(dateString, logicType) {
  if (!dateString) return false;
  const targetDate = new Date(dateString).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  if (logicType === "today") return targetDate === today;
  if (logicType === "upcoming") return targetDate >= today;
  return false;
}

// ==========================================
// 4. NOTIFICATION & HISTORY LOGIC
// ==========================================

function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") showToast("Đã bật nhắc nhở! 🔔");
    });
  }
}

function logNotification(title, message) {
  if (!currentUser) return;
  const notifRef = ref(db, `users/${currentUser.uid}/notifications`);
  push(notifRef, {
    title: title,
    message: message,
    timestamp: Date.now(),
    read: false,
  });
}

function checkReminders() {
  if (Notification.permission !== "granted" || !currentUser) return;
  const now = new Date().getTime();

  Object.entries(globalTasks).forEach(([taskId, task]) => {
    if (!task.completed && task.dueDate && !task.isNotified) {
      const taskTime = new Date(task.dueDate).getTime();
      const alertOffsetMs = (task.alertOffset || 0) * 60 * 1000;
      if (now >= taskTime - alertOffsetMs) {
        new Notification(`🔔 Sắp đến hạn: ${task.title}`, {
          body: `Hạn chót: ${formatDateDisplay(task.dueDate)}`,
          icon: "https://cdn-icons-png.flaticon.com/512/7650/7650639.png",
        });

        logNotification("Sắp đến hạn", `Task "${task.title}" cần làm ngay!`);
        update(ref(db, `users/${currentUser.uid}/todos/${taskId}`), {
          isNotified: true,
        });
      }
    }
  });
}
setInterval(checkReminders, 60000);

function listenToNotifications(userId) {
  onValue(ref(db, `users/${userId}/notifications`), (snapshot) => {
    const data = snapshot.val();
    notifList.innerHTML = "";

    if (data) {
      const list = Object.entries(data).sort(
        (a, b) => b[1].timestamp - a[1].timestamp
      );
      notifBadge.textContent = list.length;
      notifBadge.classList.remove("hidden");

      list.forEach(([key, notif]) => {
        const li = document.createElement("li");
        li.className = "notif-item";
        li.innerHTML = `
            <span class="notif-title">${notif.title}</span>
            <span class="notif-message">${notif.message}</span>
            <span class="notif-time">${new Date(
              notif.timestamp
            ).toLocaleString("vi-VN")}</span>
        `;
        notifList.appendChild(li);
      });
    } else {
      notifBadge.classList.add("hidden");
      notifList.innerHTML = `<li style="padding:15px; text-align:center; color:#999; font-size:13px;">Chưa có thông báo nào</li>`;
    }
  });
}

notifBtn.onclick = (e) => {
  e.stopPropagation();
  notifPanel.classList.toggle("hidden");
};
clearNotifBtn.onclick = () => {
  if (confirm("Xóa toàn bộ lịch sử?"))
    remove(ref(db, `users/${currentUser.uid}/notifications`));
};
document.addEventListener("click", (e) => {
  if (notifPanel && !notifPanel.contains(e.target) && e.target !== notifBtn) {
    notifPanel.classList.add("hidden");
  }
});

// ==========================================
// 5. DETAIL MODAL LOGIC (POPUP)
// ==========================================

window.openDetailModal = function (taskId) {
  const task = globalTasks[taskId];
  if (!task) return;

  currentDetailId = taskId;

  detailTitle.value = task.title;
  detailDesc.value = task.desc || "";
  detailCheckbox.checked = task.completed;
  detailDate.value = task.dueDate || "";
  detailPriority.value = task.priority || "normal";
  detailAlert.value = task.alertOffset || 0;

  if (commentInput) {
    commentInput.disabled = false;
    commentInput.value = "";
  }

  detailSubtasksBuffer = task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : [];
  renderDetailSubtasks();
  renderDetailComments(task.comments);

  detailOverlay.classList.remove("hidden");
};

function renderDetailComments(comments) {
  let list = document.getElementById("detailCommentList");
  if (!list) {
    list = document.createElement("div");
    list.id = "detailCommentList";
    list.className = "comment-list";
    const inputBox = document.querySelector(".comment-input-box");
    detailCommentsSection.insertBefore(list, inputBox);
  }
  list.innerHTML = "";

  if (comments) {
    const commentsArray = Object.values(comments).sort((a, b) => a.timestamp - b.timestamp);
    commentsArray.forEach(comment => {
        const item = document.createElement("div");
        item.style.cssText = "display: flex; gap: 10px; margin-bottom: 10px;";
        item.innerHTML = `
            <div class="avatar small" style="flex-shrink:0; background: #555;">${comment.userInitial || "U"}</div>
            <div style="background: #f5f5f5; padding: 8px 12px; border-radius: 10px; font-size: 13px; flex: 1;">
                <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px; color: #555;">
                    ${comment.userName}
                    <span style="font-weight: normal; color: #999; margin-left: 5px;">${new Date(comment.timestamp).toLocaleString('vi-VN')}</span>
                </div>
                <div style="color: #333;">${comment.text}</div>
            </div>
        `;
        list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }
}

if (commentInput) {
    commentInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const text = commentInput.value.trim();
            if (!text) return;
            if (!currentUser || !currentDetailId) return showToast("Vui lòng đăng nhập!", "error");

            const commentData = {
                text: text,
                timestamp: Date.now(),
                userId: currentUser.uid,
                userName: currentUser.displayName || "User",
                userInitial: (currentUser.displayName || "U").charAt(0).toUpperCase()
            };

            push(ref(db, `users/${currentUser.uid}/todos/${currentDetailId}/comments`), commentData)
                .then(() => { commentInput.value = ""; })
                .catch(err => showToast("Lỗi: " + err.message, "error"));
        }
    });
}

function renderDetailSubtasks() {
  detailSubtaskList.innerHTML = "";
  detailSubtasksBuffer.forEach((sub, index) => {
    const div = document.createElement("div");
    div.className = "detail-subtask-item";
    div.innerHTML = `
        <input type="checkbox" ${
          sub.completed ? "checked" : ""
        } onchange="toggleDetailSubtask(${index})" class="custom-checkbox">
        <input type="text" class="detail-subtask-input" value="${
          sub.text
        }" onchange="updateDetailSubtaskText(${index}, this.value)">
        <button onclick="removeDetailSubtask(${index})" class="btn-delete" style="opacity:1; font-size:12px;">✕</button>
    `;
    detailSubtaskList.appendChild(div);
  });
}

window.toggleDetailSubtask = function (index) {
  detailSubtasksBuffer[index].completed = !detailSubtasksBuffer[index].completed;
};
window.updateDetailSubtaskText = function (index, text) {
  detailSubtasksBuffer[index].text = text;
};
window.removeDetailSubtask = function (index) {
  detailSubtasksBuffer.splice(index, 1);
  renderDetailSubtasks();
};

if (addDetailSubtaskBtn) {
  addDetailSubtaskBtn.onclick = () => {
    detailSubtasksBuffer.push({ text: "Việc nhỏ mới...", completed: false });
    renderDetailSubtasks();
  };
}

saveDetailBtn.onclick = () => {
  if (!currentUser || !currentDetailId) return;

  const updates = {
    title: detailTitle.value.trim(),
    desc: detailDesc.value.trim(),
    completed: detailCheckbox.checked,
    dueDate: detailDate.value,
    priority: detailPriority.value,
    alertOffset: parseInt(detailAlert.value),
    subtasks: detailSubtasksBuffer,
    updatedAt: Date.now(),
  };

  if (detailCheckbox.checked && !globalTasks[currentDetailId].completed) {
      updates.completedAt = Date.now();
  } else if (!detailCheckbox.checked) {
      updates.completedAt = null;
  }

  update(
    ref(db, `users/${currentUser.uid}/todos/${currentDetailId}`),
    updates
  )
    .then(() => {
      showToast("Đã cập nhật chi tiết!");
      detailOverlay.classList.add("hidden");
    })
    .catch((err) => showToast(err.message, "error"));
};

closeDetailBtn.onclick = () => detailOverlay.classList.add("hidden");
detailOverlay.onclick = (e) => {
  if (e.target === detailOverlay) detailOverlay.classList.add("hidden");
};

// ==========================================
// 6. QUICK ADD FORM LOGIC (SIMPLE)
// ==========================================

function resetForm() {
  taskForm.classList.add("hidden");
  taskInput.value = "";
  descInput.value = "";
  
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);
  
  alertInput.value = "0";
  priorityInput.value = "normal";
}

openBtns.forEach((btn) =>
  btn.addEventListener("click", () => {
    resetForm();
    taskForm.classList.remove("hidden");
    taskInput.focus();
  })
);

cancelBtn.onclick = () => taskForm.classList.add("hidden");

confirmBtn.onclick = () => {
  const title = taskInput.value.trim();
  const desc = descInput.value.trim();
  const dueDate = dateInput.value;
  const alertOffset = parseInt(alertInput.value);
  const priority = priorityInput.value;

  if (!title) return showToast("Vui lòng nhập tên công việc!", "error");
  if (!currentUser) return;

  const taskData = {
    title,
    desc,
    dueDate,
    alertOffset,
    priority,
    isNotified: false,
    updatedAt: Date.now(),
    completed: false,
    createdAt: Date.now(),
    completedAt: null
  };

  push(ref(db, `users/${currentUser.uid}/todos`), taskData)
    .then(() => {
      showToast("Thêm mới thành công!");
      resetForm();
    })
    .catch((err) => showToast(err.message, "error"));
};

// ==========================================
// 7. MAIN LIST RENDER & LOGIC
// ==========================================

window.toggleTaskStatus = function (taskId, currentStatus) {
  if (!currentUser) return;
  
  const updates = {
    completed: !currentStatus
  };

  if (!currentStatus) {
      updates.completedAt = Date.now();
  } else {
      updates.completedAt = null;
  }

  update(ref(db, `users/${currentUser.uid}/todos/${taskId}`), updates);
};

function createTaskElement(id, data) {
  const li = document.createElement("li");
  li.className = `task-item ${
    data.completed ? "completed" : ""
  } priority-${data.priority || "normal"}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "custom-checkbox";
  checkbox.checked = data.completed;
  checkbox.onclick = (e) => {
    e.stopPropagation();
    window.toggleTaskStatus(id, data.completed);
  };

  const divContent = document.createElement("div");
  divContent.className = "task-content";
  divContent.onclick = () => window.openDetailModal(id);

  const titleHeader = document.createElement("div");
  titleHeader.style.display = "flex";
  titleHeader.style.alignItems = "center";
  if (data.priority === "urgent") {
    titleHeader.innerHTML += `<span class="priority-badge urgent">KHẨN CẤP</span>`;
  } else if (data.priority === "high") {
    titleHeader.innerHTML += `<span class="priority-badge high">CAO</span>`;
  }

  const strong = document.createElement("strong");
  strong.textContent = data.title;
  titleHeader.appendChild(strong);
  divContent.appendChild(titleHeader);

  if (data.subtasks && data.subtasks.length > 0) {
    const total = data.subtasks.length;
    const done = data.subtasks.filter((s) => s.completed).length;
    const percent = Math.round((done / total) * 100);
    divContent.innerHTML += `
        <div style="font-size:11px; color:#777; margin-top:4px; display:flex; align-items:center; gap:8px;">
            <div class="progress-container" style="flex:1; max-width:100px; margin:0;">
                <div class="progress-bar" style="width:${percent}%;"></div>
            </div>
            <span>${done}/${total}</span>
        </div>`;
  }

  if (data.dueDate || data.desc) {
    const infoDiv = document.createElement("div");
    infoDiv.className = "info-row";

    if (data.dueDate) {
        let dateHtml = `<span class="task-date">📅 ${formatDateDisplay(data.dueDate)}</span>`;
        if (new Date(data.dueDate) < new Date() && !data.completed) {
            dateHtml += `<span style="color:#e74c3c; font-weight:bold; font-size:11px;">(Quá hạn)</span>`;
        }
        infoDiv.innerHTML += dateHtml;
    }
    
    if (data.desc) {
        infoDiv.innerHTML += `<span class="sub-desc" style="margin-left:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px; display:inline-block; vertical-align:middle;">${data.desc}</span>`;
    }
    divContent.appendChild(infoDiv);
  }

  const actionDiv = document.createElement("div");
  const btnDel = document.createElement("button");
  btnDel.className = "btn-delete";
  btnDel.textContent = "🗑️";
  btnDel.title = "Xóa";
  btnDel.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Bạn có chắc chắn muốn xóa không?")) {
      remove(ref(db, `users/${currentUser.uid}/todos/${id}`));
    }
  };
  actionDiv.appendChild(btnDel);

  li.appendChild(checkbox);
  li.appendChild(divContent);
  li.appendChild(actionDiv);
  return li;
}

function renderTasks() {
  taskList.innerHTML = "";
  const keyword = searchInput.value.toLowerCase().trim();
  let tasksArray = Object.entries(globalTasks);

  if (currentFilter === "completed") {
      document.querySelector('.title').textContent = "Nhật ký hoạt động";
      tasksArray = tasksArray.filter(([k, v]) => v.completed);
      
      if (keyword) tasksArray = tasksArray.filter(([k, v]) => v.title.toLowerCase().includes(keyword));

      if (tasksArray.length > 0) {
          emptyState.classList.add("hidden");
          tasksArray.sort((a, b) => (b[1].completedAt || 0) - (a[1].completedAt || 0));

          let lastDateStr = "";

          tasksArray.forEach(([key, task]) => {
              const time = task.completedAt || task.updatedAt || Date.now();
              const dateHeader = getNiceDateHeader(time);

              if (dateHeader !== lastDateStr) {
                  const header = document.createElement("div");
                  header.className = "activity-date-header"; 
                  header.textContent = dateHeader;
                  taskList.appendChild(header);
                  lastDateStr = dateHeader;
              }

              const li = document.createElement("li");
              li.style.cssText = "display: flex; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #f9f9f9; font-size: 14px; color: #333;";
              
              li.innerHTML = `
                  <div style="width: 24px; height: 24px; background: #333; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 10px; margin-right: 15px; flex-shrink: 0; position: relative;">
                      You <div style="position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; background: #2ecc71; border-radius: 50%; border: 1px solid white;"></div>
                  </div>
                  <div style="flex: 1;">
                      <div style="margin-bottom: 4px; line-height: 1.4;">
                          Bạn đã hoàn thành: <span style="color: #db4c3f; text-decoration: line-through; cursor: pointer; font-weight:500;" onclick="window.toggleTaskStatus('${key}', true)">${task.title}</span>
                      </div>
                      <div style="font-size: 12px; color: #999; display: flex; justify-content: space-between;">
                          <span>${new Date(time).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
                          <span>Inbox 📥</span>
                      </div>
                  </div>
              `;
              taskList.appendChild(li);
          });
      } else {
          emptyState.classList.remove("hidden");
      }
      return; 
  }

  if (currentFilter === "upcoming") {
      document.querySelector('.title').textContent = "Lịch trình sắp tới";
      tasksArray = tasksArray.filter(([k, v]) => !v.completed && checkDateLogic(v.dueDate, "upcoming"));
      
      if (keyword) tasksArray = tasksArray.filter(([k, v]) => v.title.toLowerCase().includes(keyword));

      if (tasksArray.length > 0) {
          emptyState.classList.add("hidden");
          tasksArray.sort((a, b) => {
              const dateA = a[1].dueDate ? new Date(a[1].dueDate) : new Date(8640000000000000);
              const dateB = b[1].dueDate ? new Date(b[1].dueDate) : new Date(8640000000000000);
              return dateA - dateB;
          });

          let lastDateStr = "";

          tasksArray.forEach(([key, task]) => {
              if (task.dueDate) {
                  const dateHeader = getNiceDateHeader(task.dueDate);
                  if (dateHeader !== lastDateStr) {
                      const header = document.createElement("div");
                      header.textContent = dateHeader;
                      header.className = "activity-date-header"; 
                      taskList.appendChild(header);
                      lastDateStr = dateHeader;
                  }
              }
              taskList.appendChild(createTaskElement(key, task));
          });
      } else {
          emptyState.classList.remove("hidden");
      }
      return;
  }

  if (currentFilter === "today") {
    document.querySelector(".title").textContent = "Hôm nay";
    tasksArray = tasksArray.filter(([k, v]) => !v.completed && checkDateLogic(v.dueDate || v.createdAt, "today"));
  } else {
    document.querySelector(".title").textContent = "Tất cả (Inbox)";
    tasksArray = tasksArray.filter(([k, v]) => !v.completed);
  }

  if (keyword)
    tasksArray = tasksArray.filter(([k, v]) =>
      v.title.toLowerCase().includes(keyword)
    );

  if (tasksArray.length > 0) {
    emptyState.classList.add("hidden");
    tasksArray.sort((a, b) => {
      const pA = PRIORITY_SCORE[a[1].priority || "normal"];
      const pB = PRIORITY_SCORE[b[1].priority || "normal"];
      if (pA !== pB) return pB - pA;

      const dA = a[1].dueDate ? new Date(a[1].dueDate) : new Date(a[1].createdAt);
      const dB = b[1].dueDate ? new Date(b[1].dueDate) : new Date(b[1].createdAt);
      return dA - dB;
    });

    tasksArray.forEach(([key, task]) => {
      taskList.appendChild(createTaskElement(key, task));
    });
  } else {
    emptyState.classList.remove("hidden");
  }
}

function listenToTasks(userId) {
  onValue(ref(db, `users/${userId}/todos`), (snapshot) => {
    globalTasks = snapshot.val() || {};
    checkReminders();
    renderTasks();

    if (currentDetailId && !detailOverlay.classList.contains("hidden")) {
        const currentTask = globalTasks[currentDetailId];
        if (currentTask && currentTask.comments) {
            renderDetailComments(currentTask.comments);
        }
    }
  });
}

filterBtns.forEach((btn) => {
  btn.onclick = () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    if (currentFilter === "upcoming") requestNotificationPermission();
    renderTasks();
  };
});

searchInput.oninput = renderTasks;

// ==========================================
// 8. AUTH EVENTS
// ==========================================

if (loginBtn) {
  loginBtn.onclick = async () => {
    try {
      await signInWithPopup(auth, provider);
      showToast("Đăng nhập thành công!");
      requestNotificationPermission();
    } catch (err) {
      showToast(err.message, "error");
    }
  };
}

if (logoutBtn) {
  logoutBtn.onclick = () => {
    if (confirm("Bạn có chắc muốn đăng xuất?")) signOut(auth);
  };
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    authOverlay.classList.add("hidden");
    appContainer.classList.remove("hidden");
    appContainer.style.display = "flex";

    const avatarEl = document.querySelector(".avatar");
    const nameEl = document.getElementById("userNameDisplay");
    if (avatarEl)
      avatarEl.textContent = user.displayName.charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = user.displayName;

    listenToTasks(user.uid);
    listenToNotifications(user.uid);
  } else {
    currentUser = null;
    authOverlay.classList.remove("hidden");
    appContainer.classList.add("hidden");
    appContainer.style.display = "none";
  }
});