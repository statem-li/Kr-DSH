// dsh-zh-thinking browser half — 设置页「中文思考」开关
// ModuleLoader bundle(CJS factory),与 dsh-updater / dsh-opencode-go-usage 同模式;
// 状态读写走宿主路由 /api/zh-thinking(settings.yaml 持久化)。
window.__ModuleLoader__.load({
  id: 'dsh-zh-thinking',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var createElement = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect

    // ---- 样式(Setting-Cell 行式布局,主题 token)----
    var rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0' }
    var copyStyle = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }
    var titleStyle = { fontSize: 14, color: 'var(--dsw-alias-label-primary)' }
    var descStyle = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }
    var switchStyle = {
      position: 'relative', width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
      flex: 'none', background: 'var(--dsw-alias-border-l2)', transition: 'background .15s', padding: 0,
    }
    var switchOnStyle = Object.assign({}, switchStyle, { background: 'var(--dsw-alias-brand-primary)' })
    var knobStyle = {
      position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff',
      transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
    }
    var knobOnStyle = Object.assign({}, knobStyle, { left: 20 })

    function fetchState() {
      return fetch('/api/zh-thinking', { cache: 'no-store' }).then(function (r) { return r.json() })
    }

    function postState(enabled) {
      return fetch('/api/zh-thinking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: enabled }),
      }).then(function (r) { return r.json() })
    }

    function ThinkingRow() {
      var state = useState(null) // null = 加载中
      var enabled = state[0]
      var setEnabled = state[1]

      useEffect(function () {
        var alive = true
        fetchState().then(function (r) {
          if (alive && r && typeof r.enabled === 'boolean') setEnabled(r.enabled)
        }).catch(function () {})
        return function () { alive = false }
      }, [])

      function toggle() {
        var next = !(enabled === true)
        setEnabled(next)
        postState(next).catch(function () {})
      }

      var btnStyle = enabled === true ? switchOnStyle : switchStyle
      var knob = enabled === true ? knobOnStyle : knobStyle

      return createElement('div', { style: rowStyle }, [
        createElement('div', { style: copyStyle }, [
          createElement('div', { style: titleStyle }, '中文思考'),
          createElement('div', { style: descStyle }, '让内部推理使用中文(下一轮生效)'),
        ]),
        createElement('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': enabled === true,
          style: btnStyle,
          onClick: toggle,
          disabled: enabled === null,
          'aria-label': '中文思考开关',
        }, createElement('span', { style: knob })),
      ])
    }

    function apply(ctx) {
      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'zh-thinking',
          order: 40,
        }, ThinkingRow)
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
