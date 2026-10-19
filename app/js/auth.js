// 회원가입(학번) / 로그인 / 승인 대기
window.Auth = (() => {
  const { h, toast, sha256 } = U;
  function render(container) {
    container.innerHTML = '';
    let mode = 'login';
    const wrap = h('div', { class: 'auth-wrap' });
    const draw = () => {
      wrap.innerHTML = '';
      const tabs = h('div', { class: 'tabs' }, ['login', 'signup'].map(m => h('button', { class: 'tab' + (mode === m ? ' active' : ''), onClick: () => { mode = m; draw(); } }, m === 'login' ? '로그인' : '회원가입')));
      const sid = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: '학번 (예: 20241234)', maxlength: '12', autocomplete: 'username' });
      const name = h('input', { class: 'input', type: 'text', placeholder: '이름', maxlength: '20', autocomplete: 'name' });
      const pin = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '비밀번호 (숫자 4~6자리)', maxlength: '6', autocomplete: 'current-password' });
      const pin2 = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '비밀번호 확인', maxlength: '6' });
      const msg = h('div', { class: 'form-msg' });
      const btn = h('button', { class: 'btn primary block', onClick: submit }, mode === 'login' ? '로그인' : '가입 신청');
      async function submit() {
        const id = sid.value.trim(), p = pin.value.trim(); msg.textContent = '';
        if (!/^\d{7,10}$/.test(id)) { msg.textContent = '학번은 숫자 7~10자리입니다.'; return; }
        if (!/^\d{4,6}$/.test(p)) { msg.textContent = '비밀번호는 숫자 4~6자리입니다.'; return; }
        btn.disabled = true;
        try {
          const ph = await sha256(id + ':' + p);
          if (mode === 'signup') {
            const nm = name.value.trim();
            if (nm.length < 2) { msg.textContent = '이름을 입력하세요.'; btn.disabled = false; return; }
            if (p !== pin2.value.trim()) { msg.textContent = '비밀번호 확인이 일치하지 않습니다.'; btn.disabled = false; return; }
            await Store.signup({ studentId: id, name: nm, pinHash: ph });
            toast('가입 신청 완료! 교수님 승인 후 로그인할 수 있어요.', 'ok'); mode = 'login'; draw(); return;
          }
          const user = await Store.login(id, ph);
          if (user.status !== 'approved') {
            msg.textContent = user.status === 'rejected' ? '가입이 거절되었습니다. 교수님께 문의하세요.' : '승인 대기 중입니다. 교수님 승인 후 이용할 수 있어요.';
            btn.disabled = false; return;
          }
          const sess = { id: user.id, studentId: user.studentId, name: user.name };
          Store.setSession(sess); App.onLogin(sess);
        } catch (e) { msg.textContent = e.message; }
        btn.disabled = false;
      }
      [sid, name, pin, pin2].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
      U.append(wrap, 
        h('div', { class: 'auth-logo' }, h('div', { class: 'logo-mark' }, '🏥'), h('h1', { text: Store.settings.appName }), h('p', { class: 'muted', text: Store.settings.schoolName + ' · 임상 시뮬레이션 학습' })),
        tabs,
        h('div', { class: 'form' }, sid, mode === 'signup' ? name : null, pin, mode === 'signup' ? pin2 : null, msg, btn),
        h('p', { class: 'tiny muted' }, mode === 'signup'
          ? '가입 후 교수님(관리자) 승인이 필요합니다. 학번·이름·비밀번호 해시값만 저장되며 외부 서버로 전송되지 않습니다.'
          : '처음이신가요? 회원가입 탭에서 학번으로 가입 신청하세요.'),
        h('button', { class: 'link-btn', onClick: () => App.show('admin') }, '관리자(교수) 로그인')
      );
    };
    draw(); U.append(container, wrap);
  }
  function logout() { Store.clearSession(); App.show('auth'); }
  return { render, logout };
})();