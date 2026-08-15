// dsh-image-gen browser half — 设置页「生图模型」:选择当前生图模型
// ModuleLoader bundle(CJS factory);数据走宿主 HTTP API snapshot / config。
window.__ModuleLoader__.load({
  id: 'dsh-image-gen',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var createElement = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect

    function fetchJson(url, options) {
      return fetch(url, options || {}).then(function (r) { return r.json() })
    }

    function ImageGenSection() {
      var state = useState({ loading: true, error: null, providers: [], imageActive: '' })
      var loading = state[0].loading
      var error = state[0].error
      var providers = state[0].providers
      var imageActive = state[0].imageActive
      var setState = state[1]

      useEffect(function () {
        var alive = true
        fetchJson('/api/image-gen/snapshot').then(function (r) {
          if (!alive) return
          if (r && r.ok !== false) {
            setState({ loading: false, error: null, providers: r.providers || [], imageActive: r.imageActive || '' })
          } else {
            setState({ loading: false, error: '加载失败: ' + (r && r.error ? r.error : '未知错误'), providers: [], imageActive: '' })
          }
        }).catch(function (err) {
          if (alive) setState({ loading: false, error: '加载失败: ' + String(err), providers: [], imageActive: '' })
        })
        return function () { alive = false }
      }, [])

      function save(key) {
        setState({ loading: false, error: null, providers: providers, imageActive: key })
        fetchJson('/api/image-gen/config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageActive: key }),
        }).catch(function () {})
      }

      if (loading) return createElement('div', null, '加载中…')
      if (error) return createElement('div', { style: { color: '#e74c3c', padding: 8 } }, error)

      var selectStyle = {
        width: '100%', padding: '6px 8px', borderRadius: 6,
        border: '1px solid rgba(128,128,128,.4)', background: 'transparent', color: 'inherit', marginTop: 4,
      }
      var rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }
      var badgeStyle = { fontSize: 12, color: 'rgba(128,128,128,.85)' }

      var options = []
      providers.forEach(function (p) {
        p.models.forEach(function (m) {
          options.push({ key: p.id + '/' + m.id, label: p.name + ' / ' + m.name })
        })
      })

      return createElement('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 10 } },
        createElement('div', { style: { fontSize: 13, color: 'rgba(128,128,128,.9)' } },
          '选择当前生图模型：当你要求生成图片时，我会调用 generate_image 工具，由所选模型生成。',
        ),
        createElement('label', { style: { fontSize: 13, display: 'flex', flexDirection: 'column' } },
          '当前生图模型（生成图片）',
          createElement('select', {
            style: selectStyle,
            value: imageActive,
            disabled: options.length === 0,
            onChange: function (e) { save(e.target.value) },
          },
            options.length === 0
              ? createElement('option', { value: '' }, '（无可选模型）')
              : options.map(function (o) { return createElement('option', { key: o.key, value: o.key }, o.label) }),
          ),
        ),
        createElement('div', null,
          providers.map(function (p) {
            return createElement('div', { key: p.id },
              createElement('div', { style: { fontWeight: 600, margin: '8px 0 2px' } }, p.name),
              p.models.length === 0
                ? createElement('div', { style: badgeStyle }, '（无法枚举模型）')
                : p.models.map(function (m) {
                  return createElement('div', { key: m.id, style: rowStyle },
                    createElement('span', { style: { flex: 1 } }, m.name),
                    createElement('button', {
                      style: {
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                        border: '1px solid rgba(128,128,128,.4)', background: 'transparent', color: 'inherit',
                      },
                      onClick: function () { save(p.id + '/' + m.id) },
                    }, imageActive === p.id + '/' + m.id ? '✓ 当前' : '设为生图'),
                  )
                }),
            )
          }),
        ),
      )
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'image-gen',
          order: 13,
          label: '生图模型',
        }, ImageGenSection)
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
