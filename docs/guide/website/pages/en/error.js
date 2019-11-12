const React = require('react')

class Error extends React.Component {
  render() {
    return (
      <div className="error">
        <div className="container">
          <div className="robot">🤖</div>
          <div className="message">Oops! Page not found.</div>
        </div>
      </div>
    )
  }
}

module.exports = Error
