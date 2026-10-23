(function () {
      var msg = document.getElementById("msg");
      try {
        window.msalRedirectBridge.broadcastResponseToMainFrame().catch(function (e) {
          msg.innerHTML = 'Anmeldung konnte nicht abgeschlossen werden. <a href="./">Zurück zur App</a>';
          console.error(e);
        });
      } catch (e) {
        msg.innerHTML = '<a href="./">Zurück zur App</a>';
        console.error(e);
      }
    })();
