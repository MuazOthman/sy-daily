# Contributing to Syrian Daily News Bot

Thank you for your interest in contributing to Syrian Daily News Bot! This document outlines the guidelines for contributing to this project.

## Getting Started

Check the README.md for detailed setup instructions.

## Development Process

### Before Making Changes

1. Create a new branch: `git checkout -b feature/your-feature-name`
2. Ensure you can run the project locally: `yarn start`
3. Run tests: `yarn test`

### Making Changes

1. Follow the existing code style and conventions
2. Write tests for new functionality
3. Ensure your code passes all tests: `yarn test`
4. Lint the project to check for TypeScript errors: `yarn lint`
5. Test your changes with the local development environment

### Code Standards

- Use TypeScript for all new code
- Follow the existing naming conventions
- Maintain the existing project structure
- Keep functions focused and modular

### Testing

- Write unit tests for new functionality using Vitest
- Ensure all existing tests pass
- Test both English and Arabic language functionality, when applicable
- Test banner generation if making changes to that system

### Pull Request Process

1. Update documentation if needed
2. Ensure your branch is up to date with main: `git fetch && git rebase origin/main` or `git fetch && git merge origin/main`
3. Push your branch: `git push origin feature/your-feature-name`
4. Create a pull request with:
   - Clear title describing the change
   - Detailed description of what was changed and why
   - Screenshots if UI changes are involved
   - Test results showing functionality works

## Areas for Contribution

### Welcome Contributions

- Bug fixes
- Performance improvements
- Documentation improvements
- Test coverage improvements
- Code refactoring for better maintainability
- Banner design improvements
- Translation accuracy improvements

### Requires Discussion

- Major architectural changes
- New news source integrations
- New dependencies
- Changes to the AI/LLM integration
- Changes to the AWS infrastructure
- New language support beyond English/Arabic

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help maintain a welcoming environment for all contributors
- Follow GitHub's Community Guidelines

## Questions?

- Open an issue for bugs or feature requests
- Use discussions for general questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
