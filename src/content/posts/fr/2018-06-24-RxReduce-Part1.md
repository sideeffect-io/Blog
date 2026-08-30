---
title: RxReduce — Architecture réactive à conteneur d’état, partie 1
date: 2018-06-24
description: La gestion d’état est récemment devenue une préoccupation très populaire dans les applications mobiles. L’idée d’un état constituant l’unique source de vérité d’une application est particulièrement séduisante ! Les vues ne seraient alors qu’une représentation affichable de cet état 👌.
tags: architecture, programmation réactive, open source
image: images/2018-06-24-RxReduce-Part1/RxReduceArchitecture.png
lang: fr
---

La gestion d’état est récemment devenue une préoccupation très populaire dans les applications mobiles. L’idée d’un état constituant l’unique source de vérité d’une application est particulièrement séduisante ! Les vues ne seraient alors qu’une représentation affichable de cet état 👌.

Mais, comme vous le savez, un grand pouvoir implique de grandes responsabilités… et tout un tas de questions 😀 :

* Qu’est-ce qu’un état, bon sang ?
* Comment construire mon application autour d’un état ?
* Existe-t-il un pattern ou une architecture qui facilite la gestion d’état ?
* Comment exploiter la sûreté des types et la sémantique de valeur de Swift pour gérer élégamment les mutations d’état ?

Cela fait beaucoup de choses à couvrir, mais n’ayons pas peur : au bout du compte, tout cela est assez simple.

Cet article comporte deux parties. Dans la première, je vais tenter de vous guider à travers le merveilleux pays de l’état et de son immutabilité. [Dans la seconde](/fr/posts/2018-06-25-rxreduce-part2/), je présenterai RxReduce, un framework que j’ai publié en open source et qui implémente une **architecture réactive à conteneur d’état**.

# Qu’est-ce qu’un état ?

La notion d’état se retrouve dans de nombreux domaines : mécanique classique, mécanique quantique, thermodynamique, physique, politique, informatique, ingénierie logicielle…

Quelques définitions issues de Wikipédia :

> En thermodynamique, l’état d’un système est sa condition à un instant donné, entièrement déterminée par les valeurs d’un ensemble approprié de paramètres appelés variables d’état, paramètres d’état ou variables thermodynamiques.

> *En informatique, un programme est dit « avec état » s’il est conçu pour mémoriser les événements ou les interactions utilisateur précédents ; les informations mémorisées sont appelées l’état du système.*

> En physique, un état de la matière est l’une des formes distinctes sous lesquelles la matière peut exister. Quatre états sont observables dans la vie quotidienne : solide, liquide, gazeux et plasma.

Quel que soit le domaine, un état est défini par :

* certaines propriétés intrinsèques — forme, couleur, poids… ;
* les valeurs de ces propriétés à un instant donné ;
* les conditions de son existence et les règles qui régissent ses mutations.

En informatique, nous avons tous appris le fonctionnement d’une machine à états. Je trouve sa définition particulièrement pertinente, car elle offre de très bons indices sur la suite de cet article :

> Il s’agit d’une machine abstraite qui ne peut se trouver que dans un seul état parmi un nombre fini d’états possibles à un instant donné. La machine à états peut passer d’un état à un autre en réponse à des entrées externes. Ce passage est appelé une transition. Une machine à états est définie par la liste de ses états, son état initial et les conditions de chaque transition.

Devinez quoi ? Une application est une machine à états :

* l’état d’une application est l’agrégat de la disposition de ses écrans, de la navigation entre ces écrans, des données affichées, des sons qu’elle peut émettre, etc. ;
* elle possède un nombre fini d’états possibles ;
* elle ne peut se trouver que dans un seul état à la fois, selon les actions de l’utilisateur, l’environnement d’exécution, l’appareil physique, les données externes, etc. ;
* en fonction d’entrées externes — utilisateur, réseau… —, une application passe d’un état à un autre — navigation entre les écrans, mise à jour d’une vue… : ce sont les transitions d’état.

**L’état est le cœur de votre application, par définition !**

Si l’**état** est correctement géré, vous êtes sur la bonne voie pour obtenir une application sûre et sans bugs.

# Les architectures à conteneur d’état

Maîtriser la notion d’état ne représente que la moitié du chemin 😀. Le défi consiste à bien le gérer. C’est là qu’interviennent les **architectures à conteneur d’état**.

Ces architectures ne sont pas une idée nouvelle. Elles reposent toutes sur des concepts bien connus : types valeur, immutabilité, programmation fonctionnelle et flux de données unidirectionnel. **Redux** est une implémentation célèbre de ce type d’architecture.

Avant d’aller plus loin, je vous encourage vivement à lire ces deux excellents articles consacrés aux architectures à conteneur d’état et aux flux de données unidirectionnels :

* [iOS Architecture: A State Container based approach](https://jobandtalent.engineering/ios-architecture-an-state-container-based-approach-4f1a9b00b82e)
* [Unidirectional Data Flow: Shrinking Massive View Controllers](https://academy.realm.io/posts/benji-encz-unidirectional-data-flow-swift/)

## Une image vaut mille mots

L’unique objectif d’une **architecture à conteneur d’état** est de fournir une manière sûre de modifier et d’exposer l’état de votre application. Voici le flux d’un tel pattern :

![](/images/2018-06-24-RxReduce-Part1/rxreducescheme.gif)

La première chose à remarquer est le caractère unidirectionnel de ce flux : imaginez une boucle d’événements partant de la vue, y revenant et produisant une nouvelle version de l’état à chaque itération. Ce sont les transitions d’état de la définition précédente de la machine à états.

## Un aperçu de chaque concept du pattern

* Le **Store** est le composant qui gère votre **State**. Il ne possède qu’une seule entrée : une fonction **dispatch()** qui reçoit une **Action** en paramètre.
* Le **State** doit être immuable par définition. L’unique manière de déclencher une mutation du **State** consiste à appeler la fonction **dispatch()** du **Store** avec une **Action** ; elle créera un nouveau **State**.
* Les **Actions** sont des types simples sans logique métier — des structures, par exemple. Elles contiennent les données nécessaires à la mutation du **State** : identifiants, chaînes de recherche, etc.
* Seules des fonctions pures et testables, appelées **Reducers**, peuvent modifier un **State**. Une fonction **reduce()** reçoit un **State** et une **Action**, puis renvoie le nouveau **State**… aussi simple que cela — c’est la transition d’état.
* Vous pouvez avoir autant de **Reducers** que vous le souhaitez ; la fonction **dispatch()** du **Store** les appliquera séquentiellement. Il peut être intéressant d’avoir un **Reducer** pour chaque préoccupation métier.
* Les **Reducers** ne peuvent pas exécuter de logique asynchrone. Ils ne peuvent modifier le **State** que de manière synchrone et testable. Le travail asynchrone, constitué d’effets de bord, sera pris en charge par d’autres mécanismes — nous le verrons dans la seconde partie.
* Le **Store** expose une forme d’observable du **State**, afin que les vues soient informées chaque fois qu’un nouveau **State** est calculé.

# Pourquoi ce pattern est-il intéressant ?

Comme nous l’avons vu plus haut : **« L’état est le cœur de votre application, par définition ! »** Un pattern centré sur un état reproductible et sûr apporte plusieurs garanties intéressantes :

* aucune propagation incontrôlée des modifications du **State**. Comme il s’agit d’un type valeur, chaque mutation crée une nouvelle copie du **State**. Ce n’est pas un type référence partagé dont les mutations pourraient entraîner des incohérences dans toute l’application ;
* les mutations du **State** sont strictement encadrées par l’envoi d’**Actions**. Cela fournit un environnement particulièrement sûr pour accueillir de nouveaux membres dans votre équipe de développement ;
* les conditions de concurrence sont évitées grâce au **State** sous forme de type valeur et à la forte séparation du travail asynchrone ;
* le **State** global de l’application est extrêmement reproductible. C’est un avantage indéniable de sa centralisation dans un **Store**. Nous pouvons le sérialiser, l’enregistrer dans le système de fichiers et le rejouer à volonté. L’application sera restaurée dans une configuration similaire à chaque fois ;
* les mutations du **State** sont non seulement reproductibles, mais aussi très faciles à tester, puisqu’elles sont provoquées par des fonctions pures sans effets de bord. Il suffit de vérifier la cohérence des sorties des **Reducers** pour une entrée stable.

Je trouve cette approche très intéressante par rapport aux patterns plus traditionnels, car elle prend en charge la cohérence de l’état de votre application. MVC, MVP, MVVM ou VIPER vous aident à découper l’application en couches bien définies, mais vous guident beaucoup moins lorsqu’il s’agit d’en gérer l’état.

C’est tout pour cette première partie. Nous avons beaucoup appris sur les fondements des architectures à conteneur d’état. [Dans la partie 2](/fr/posts/2018-06-25-rxreduce-part2/), nous nous plongerons dans une implémentation réactive appelée RxReduce, qui vous aidera à gérer l’état, ses mutations et le travail asynchrone lié aux effets de bord.

À bientôt.
