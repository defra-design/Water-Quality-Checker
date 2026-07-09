//
// Chat interface enhancements
//

window.GOVUKPrototypeKit.documentReady(() => {
  const chat = document.getElementById('wis-chat')
  if (chat) {
    chat.scrollTop = chat.scrollHeight
  }
})
