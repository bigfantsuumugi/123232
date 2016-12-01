import path from 'path'
import fs from 'fs'

module.exports = (projectLocation) => {

  const getPackageJSONPath = () => {
    const packagePath = path.resolve(projectLocation || './', './package.json')

    if (!fs.existsSync(packagePath)) {
      throw new Error('[FATAL] Could not find bot\'s package.json file')
    }

    return packagePath
  }

  const getBotInformation = () => {
    const packageJson = JSON.parse(fs.readFileSync(getPackageJSONPath()))

    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description || 'No description',
      author: packageJson.author || '<no author>',
      license: packageJson.license || 'AGPL-v3.0'
    }
  }

  return {
    getBotInformation: getBotInformation
  }
}
