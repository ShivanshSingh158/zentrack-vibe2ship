export const PREDEFINED_ROADMAPS = [
  {
    id: "frontend",
    title: "Frontend Developer Roadmap",
    description: "Step by step guide to becoming a modern frontend developer.",
    modules: [
      {
        category: "Internet Fundamentals",
        items: [
          { text: "How does the internet work?", url: "https://roadmap.sh/guides/what-is-internet" },
          { text: "What is HTTP?", url: "https://roadmap.sh/guides/http" },
          { text: "Browsers and how they work", url: "https://roadmap.sh/guides/how-browsers-work" },
          { text: "DNS and how it works", url: "https://roadmap.sh/guides/dns-in-one-picture" }
        ]
      },
      {
        category: "HTML",
        items: [
          { text: "Learn the basics of HTML", url: "" },
          { text: "Semantic HTML", url: "" },
          { text: "Forms and Validations", url: "" },
          { text: "Accessibility", url: "" }
        ]
      },
      {
        category: "CSS",
        items: [
          { text: "Learn the basics of CSS", url: "" },
          { text: "Making layouts (Flexbox & Grid)", url: "" },
          { text: "Responsive design and Media Queries", url: "" }
        ]
      },
      {
        category: "JavaScript",
        items: [
          { text: "Syntax and Basic Constructs", url: "" },
          { text: "DOM Manipulation", url: "" },
          { text: "Fetch API / Ajax (XHR)", url: "" },
          { text: "ES6+ and modular JS", url: "" }
        ]
      },
      {
        category: "React Framework",
        items: [
          { text: "Components and JSX", url: "" },
          { text: "State and Props", url: "" },
          { text: "Hooks (useState, useEffect)", url: "" },
          { text: "Context API and Redux", url: "" }
        ]
      }
    ]
  },
  {
    id: "backend",
    title: "Backend Developer Roadmap",
    description: "Step by step guide to becoming a modern backend developer.",
    modules: [
      {
        category: "Internet & OS Fundamentals",
        items: [
          { text: "How the Internet Works", url: "" },
          { text: "Terminal Usage", url: "" },
          { text: "OS Processes, Threads, Concurrency", url: "" },
          { text: "Basic Networking (TCP/UDP, Ports)", url: "" }
        ]
      },
      {
        category: "Language & Logic",
        items: [
          { text: "Learn a Language (Node.js/Python/Go)", url: "" },
          { text: "Data Structures & Algorithms", url: "" }
        ]
      },
      {
        category: "Databases",
        items: [
          { text: "Relational Databases (PostgreSQL)", url: "" },
          { text: "NoSQL Databases (MongoDB, Redis)", url: "" },
          { text: "ORMs and ODMs", url: "" },
          { text: "ACID Properties & Transactions", url: "" }
        ]
      },
      {
        category: "APIs",
        items: [
          { text: "REST API Design", url: "" },
          { text: "Authentication (JWT, OAuth)", url: "" },
          { text: "GraphQL", url: "" }
        ]
      }
    ]
  },
  {
    id: "ai",
    title: "AI & ML Engineer Roadmap",
    description: "A comprehensive guide to artificial intelligence and machine learning.",
    modules: [
      {
        category: "Prerequisites",
        items: [
          { text: "Python Programming", url: "" },
          { text: "Linear Algebra & Calculus Basics", url: "" },
          { text: "Statistics & Probability", url: "" }
        ]
      },
      {
        category: "Data Processing",
        items: [
          { text: "Pandas & NumPy", url: "" },
          { text: "Data Cleaning & Preprocessing", url: "" },
          { text: "Data Visualization (Matplotlib, Seaborn)", url: "" }
        ]
      },
      {
        category: "Machine Learning (Classic)",
        items: [
          { text: "Scikit-Learn Basics", url: "" },
          { text: "Supervised Learning (Regression, Classification)", url: "" },
          { text: "Unsupervised Learning (Clustering)", url: "" }
        ]
      },
      {
        category: "Deep Learning & Generative AI",
        items: [
          { text: "Neural Networks Fundamentals", url: "" },
          { text: "PyTorch or TensorFlow", url: "" },
          { text: "Transformer Architecture", url: "" },
          { text: "LLM APIs (OpenAI, Anthropic, Gemini)", url: "" },
          { text: "RAG (Retrieval-Augmented Generation)", url: "" }
        ]
      }
    ]
  }
];
