---
title: Des fonctions comme dépendances en Swift
date: 2020-08-19
description: Mettre en place une architecture peut être délicat. Nous avons des règles et des patterns pour nous guider, mais certaines pratiques que nous pensions bien établies méritent parfois de prendre du recul.
tags: architecture, programmation fonctionnelle
image: images/2020-08-19-FunctionsAsDependencies/header.png
lang: fr
---

# Introduction

Mettre en place une architecture au sein d’une application peut être délicat. Nous pouvons suivre des règles — SOLID, Clean Architecture — et nous laisser guider par des patterns — MVVM, MVP, MVI, Redux… —, mais certaines pratiques que nous pensions bien établies méritent parfois de prendre du recul.

Je me suis récemment retrouvé dans cette situation en développant une application qui reposait sur des [fonctions libres d’ordre supérieur](https://fr.wikipedia.org/wiki/Fonction_d%27ordre_sup%C3%A9rieur).
Dans cet article, je vais tenter de vous conduire de l’étincelle qui a fait naître cette envie de fonctions libres d’ordre supérieur jusqu’à leur utilisation pour l’injection de dépendances.

# Injection de dépendances

L’injection de dépendances est une technique au croisement de plusieurs bonnes pratiques bien connues de l’ingénierie logicielle : abstraction et découplage, responsabilité unique, inversion des dépendances. Elle permet d’obtenir des implémentations souples et testables.
Cet article part du principe que les avantages de l’injection de dépendances sont acquis. Nous allons voir à quel point l’injection de dépendances et les fonctions d’ordre supérieur se marient bien.

# Une implémentation traditionnelle

Dans la suite de cet article, nous allons nous concentrer sur un objet `UsersRepository` qui récupère des utilisateurs depuis une API REST, les filtre, puis les renvoie. Pour les besoins de la démonstration, tous les endpoints de cette API renvoient des utilisateurs, avec des variantes différentes selon la route appelée.

Pour cela, un protocole `ApiService` est injecté dans `UsersRepository`. Son but est de fournir un moyen de récupérer les utilisateurs depuis les endpoints REST :

```swift
protocol ApiService {
    func fetch(route: Route) -> AnyPublisher<[User], ApiError>
}

class UsersRepository {
    private let apiService: ApiService

    init(apiService: ApiService) {
        self.apiService = apiService
    }

    func loadAllUsers() -> AnyPublisher<[User], Error> {
        let allUsersRoute = Route("/api/users/all")
        self
            .apiService
            .fetch(route: allUsersRoute)
            .map { $0.filter { $0.isActive } }
            .mapError { _ in UsersRepositoryError.someError }
            .eraseToAnyPublisher()
    }
}
```

C’est une implémentation assez courante. Dans un cas réel, nous essaierions bien sûr de rendre `ApiService` plus polyvalent et plus sûr grâce aux types génériques et aux contraintes.

Comme je l’ai indiqué dans l’introduction, prenons un peu de recul… Pourquoi un `ApiService` ?

En réalité, nous voulons simplement récupérer des utilisateurs. Le repository se moque de leur provenance : c’est un détail d’implémentation. Une API REST n’est qu’un moyen parmi d’autres.

Une approche évidente consisterait à transformer `ApiService` en un protocole `DataProvider` plus polyvalent.

Mais comment le définir ?

* la fonction `fetch` n’a plus vraiment de sens ;
* le paramètre `route` n’est plus pertinent hors du contexte d’une API ;
* le type `ApiError` est trop spécifique.

Nous pourrions évidemment trouver des noms et des structures de données plus génériques, mais je vous propose d’explorer une autre voie.

# Injecter des fonctions

Après tout, `UsersRepository` ne dépend que d’un `AnyPublisher<[User], ApiError>` pour effectuer son travail, n’est-ce pas ?

La tentation d’injecter directement ce publisher comme dépendance est forte, mais nous ne devrions pas y céder. Une injection directe impliquerait de le construire très tôt dans le processus d’injection, ce qui pourrait provoquer des effets de bord indésirables. Peut-être sa construction prend-elle du temps ou nécessite-t-elle la résolution d’autres dépendances ? `UsersRepository` n’en sait rien et ne peut formuler aucune hypothèse. Le publisher ne devrait être construit que si, et lorsque, nous en avons besoin.

Si nous ne pouvons pas injecter le publisher, nous pouvons injecter une fonction qui le construit 👍, puis l’exécuter à notre convenance.

Essayons.

```swift
class UsersRepository {
    typealias RetrieveUsersFunction = () -> AnyPublisher<[User], Error>
    private let retrieveUsersFunction: RetrieveUsersFunction

    init(retrieveUsersFunction: @escaping RetrieveUsersFunction) {
        self.retrieveUsersFunction = retrieveUsersFunction
    }

    func loadUsers() -> AnyPublisher<[User], Error> {
        self.retrieveUsersFunction()
            .map { $0.filter { $0.isActive } }
            .mapError { _ in UsersRepositoryError.someError }
            .eraseToAnyPublisher()
    }
}
```

Qu’avons-nous fait ici ?

* Nous avons déclaré un alias de type qui décrit la signature de la fonction afin de faciliter la lecture.
* Nous avons injecté la fonction.
* Nous l’avons utilisée pour remplacer `ApiService`.
* La signature du publisher a légèrement changé : elle est passée de `AnyPublisher<[User], ApiError>` à `AnyPublisher<[User], Error>`. Nous ne voulons pas divulguer ici de détails d’implémentation à travers le type de l’erreur.

Jusqu’ici, tout va bien… mais qu’en est-il de la `Route` que nous passions à la fonction `fetch` ? Nous n’en avons plus besoin, car elle était propre à `ApiService`. Nous reviendrons néanmoins précisément sur ce point un peu plus loin.

En bonus, nous pouvons aussi injecter la fonction de filtrage. Son comportement peut ainsi varier selon le contexte — le filtre peut, par exemple, différer entre les environnements de développement, de QA et de production.

```swift
class UsersRepository {
    typealias RetrieveUsersFunction = () -> AnyPublisher<[User], Error>
    typealias FilterUserFunction = (User) -> Bool

    private let retrieveUsersFunction: RetrieveUsersFunction
    private let filterUserFunction: FilterUserFunction

    init(retrieveUsersFunction: @escaping RetrieveUsersFunction,
         filterUserFunction: @escaping FilterUserFunction) {
        self.retrieveUsersFunction = retrieveUsersFunction
        self.filterUserFunction = filterUserFunction
    }

    func loadUsers() -> AnyPublisher<[User], Error> {
        self.retrieveUsersFunction()
            .map { [filterUserFunction] in $0.filter(filterUserFunction) }
            .mapError { _ in UsersRepositoryError.someError }
            .eraseToAnyPublisher()
    }
}
```

Une nouvelle fois, nous utilisons des alias de types pour faire circuler les fonctions. Cela devient presque indispensable lorsque des fonctions servent de dépendances.

Puisque nous sommes lancés, poussons peut-être la réflexion un peu plus loin et franchissons une dernière étape vers l’utilisation systématique des fonctions.

Pourquoi avons-nous besoin d’un repository ? Le repository pattern sert généralement à regrouper toutes les opérations CRUD portant sur une entité. Nous pouvons supposer qu’un `UsersRepository` comportera plusieurs fonctions de chargement, de mise à jour et de suppression. Une fois implémentées, ces fonctions auront besoin d’un certain nombre de dépendances. Nous finirons avec un initialiseur qui reçoit toutes les fonctions requises, alors qu’une fonctionnalité donnée n’en utilisera peut-être qu’une partie. Ce n’est pas optimal.

Supprimer le repository implique que chaque fonction — chargement, mise à jour, suppression… — soit autonome et ne reçoive que les dépendances dont elle a besoin.

```swift
typealias RetrieveUsersFunction = () -> AnyPublisher<[User], Swift.Error>
typealias FilterUserFunction = (User) -> Bool

static func loadUsers(
    retrieveUsersFunction: RetrieveUsersFunction,
    filterUserFunction: @escaping FilterUserFunction
) -> AnyPublisher<[User], Error> {
    retrieveUsersFunction()
        .map { $0.filter(filterUserFunction) }
        .mapError { _ in UsersError.someError }
        .eraseToAnyPublisher()
}
```

Nous y voilà : nous disposons d’une fonction entièrement autonome. Pour plus de clarté, nous pouvons tout regrouper dans un namespace afin de raccourcir certains noms :

```swift
enum Users {
    enum Error: Swift.Error {
        case someError
    }

    typealias RetrieveFunction = () -> AnyPublisher<[User], Swift.Error>
    typealias FilterFunction = (User) -> Bool

    static func load(
        retrieveFunction: RetrieveFunction,
        filterFunction: @escaping FilterFunction = { $0.isActive }
    ) -> AnyPublisher<[User], Error> {
        retrieveFunction()
            .map { $0.filter(filterFunction) }
            .mapError { _ in Users.Error.someError }
            .eraseToAnyPublisher()
    }
}
```

> Nous pouvons également donner une valeur par défaut au paramètre `filterFunction` pour obtenir une API plus concise.

# L’impact positif sur les tests unitaires

Revenons à l’implémentation initiale de `UsersRepository`. Pour tester unitairement la fonction `loadUsers`, nous aurions dû créer un faux `ApiService` afin de satisfaire les exigences de l’initialiseur. Ce faux service devrait être capable de réussir ou d’échouer pour nous permettre de tester la sortie de `loadUsers`.

Dans le cas malheureux où `ApiService` aurait lui-même besoin d’une dépendance, nous aurions été contraints d’en implémenter également une fausse version. En appliquant cette stratégie à toute l’application, nous pourrions aboutir à une hiérarchie complexe de faux objets.

Avec des fonctions comme dépendances, nous avons toujours besoin de mocks, bien sûr, mais ils sont généralement minuscules, simples et définis juste à côté du test unitaire :

```swift
func test_loadUsers_return_users_when_dependencies_succeed() {
    // Given: a retrieve function that succeeds at getting some Users
    let successRetrieveFunction = {
        Just<[User]>([User(isActive: true), User(isActive: false)])
            .setFailureType(to: Swift.Error.self)
            .eraseToAnyPublisher()
    }

    let mockFilterFunction = { (user: User) -> Bool in return true }

    // When: loading the users
    let users = Users.load(retrieveFunction: successRetrieveFunction,
                           filterFunction: mockFilterFunction)

    // Then: we can make assertions about the retrieved users
    // XCTAssert(...)
}

func test_loadUsers_return_error_when_dependencies_fail() {
    // Given: a retrieve function that fails at getting some Users
    let failureRetrieveFunction = {
        Fail<[User], Swift.Error>(error: NSError(domain: "domain.mock",
                                                 code: -1))
            .eraseToAnyPublisher()
    }

    let mockFilterFunction = { (user: User) -> Bool in return true }

    // When: loading the users
    let users = Users.load(retrieveFunction: failureRetrieveFunction,
                           filterFunction: mockFilterFunction)

    // Then: we can make assertions about the received error
    // XCTAssert(...)
}
```

Les tests unitaires sont très faciles à imaginer, à écrire et à lire. Personnellement, je trouve cette technique particulièrement efficace pour atteindre une couverture de code élevée — et pertinente. Je pense qu’elle peut beaucoup aider dans une démarche TDD.

# Une astuce issue de la programmation fonctionnelle

Vous souvenez-vous de l’implémentation initiale de `UsersRepository` ? Elle utilisait un `ApiService` pour appeler un endpoint défini par une route. Même si l’abstraction apportée par l’injection des fonctions l’a effacé, nous devons, à la fin, fournir une fonction capable de récupérer réellement les utilisateurs. C’est au mécanisme d’injection de dépendances de fournir une implémentation concrète compatible.

Nous disposons d’un `ApiService`, mais la définition de `fetch` ne correspond pas à la signature dont nous avons besoin :

```swift
(Route) -> AnyPublisher<[User], ApiError>

                VS

() -> AnyPublisher<[User], Swift.Error>
```

Nous devons effectuer deux transformations :

* supprimer le paramètre `Route` ;
* changer le type de l’erreur.

Pour supprimer le paramètre `Route`, nous pouvons emprunter à la programmation fonctionnelle des techniques comme l’application partielle ou la curryfication.
Nous choisirons ici l’application partielle, même si la curryfication serait également un choix raisonnable.

Appliquer partiellement une fonction revient à dire au compilateur : « Hé, je connais déjà certains paramètres de cette fonction, je peux les fixer maintenant. Les autres restent indéfinis. Renvoie-moi une fonction qui ne recevra que ces paramètres afin que je puisse l’appeler plus tard ! »

Prenons un exemple 😏.

`dumbFunction` reçoit deux paramètres et renvoie un `Bool`.

```swift
func dumbFunction(param1: String, param2: Int) -> Bool {
    // Does some smart calculations and returns a Bool
}
```

Nous pouvons lui appliquer partiellement le premier paramètre afin de le « figer » et de récupérer en retour une fonction qui ne reçoit que le second.

```swift
func partializedDumbFunction(param1: String) -> (Int) -> Bool {
    return { (unknownParam2: Int) -> Bool in
        return dumbFunction(param1: param1, param2: unknownParam2)
    }
}
```

Au lieu d’utiliser `dumbFunction` avec deux paramètres, nous pouvons maintenant utiliser sa version partiellement appliquée avec un seul paramètre.

```swift
let dumbFunctionWithOneFixedParameter = partializedDumbFunction("Param1")
let dumbFunctionWithOne = dumbFunctionWithOneFixedParameter(1)
let dumbFunctionWithTwo = dumbFunctionWithOneFixedParameter(2)
```

C’est un peu comme si nous avions injecté le premier paramètre : l’application partielle l’a « capturé ».

Nous ne pouvons évidemment pas écrire une version partiellement appliquée de chaque fonction de notre base de code. Il existe un moyen de rendre l’opération générique pour n’importe quel nombre de paramètres.

```swift
func partial<Arg1, Result>(
    _ function: @escaping (Arg1) -> Result,
    arg1: Arg1
) -> () -> Result {
    return {
        function(arg1)
    }
}

func partial<Arg1, Arg2, Result>(
    _ function: @escaping (Arg1, Arg2) -> Result,
    arg1: Arg1
) -> (Arg2) -> Result {
    return { (unkownArg2: Arg2) in
        function(arg1, unkownArg2)
    }
}

func partial<Arg1, Arg2, Result>(
    _ function: @escaping (Arg1, Arg2) -> Result,
    arg2: Arg2
) -> (Arg1) -> Result {
    return { (unkownArg1: Arg1) in
        function(unkownArg1, arg2)
    }
}
```

Et nous pouvons écrire autant de variantes de `partial` que nécessaire.

Vous voyez où je veux en venir ? Nous sommes passés d’une fonction à deux paramètres à une fonction qui n’en prend plus qu’un. Nous pouvons donc passer d’une fonction à un paramètre à une fonction qui n’en prend aucun !

Revenons à la fonction `ApiService.fetch` et appliquons-lui cette technique :

```swift
let apiService = MyApiService()
let usersRoute = Route("/api/users/all")
let partializedFetchFunction = partial(apiService.fetch, arg1: usersRoute)
```

Nous disposons maintenant d’une fonction partiellement appliquée dont la signature est :

**`() -> AnyPublisher<[User], ApiError>`**. Le paramètre `route` a été capturé et sera utilisé lors de l’exécution de **`partializedFetchFunction`**.

Nous y sommes presque. Il ne nous reste qu’à masquer `ApiError`. Heureusement, Combine peut nous y aider :

```swift
...
let retrieveUsersFunction: Users.RetrieveFunction = {
    return partializedFetchFunction()
        .mapError { $0 as Swift.Error }
        .eraseToAnyPublisher()
}
```

Eeeet nous avons notre dépendance ! `retrieveUsersFunction` possède la signature suivante :
**`() -> AnyPublisher<[User], Swift.Error>`**.

Nous pouvons l’injecter dans la fonction `Users.load` 👌.

# Récapitulons

## 1 : utiliser des fonctions comme dépendances

```swift
enum Users {
    enum Error: Swift.Error {
        case someError
    }

    typealias RetrieveFunction = () -> AnyPublisher<[User], Swift.Error>
    typealias FilterFunction = (User) -> Bool

    static func load(
        retrieveFunction: RetrieveFunction,
        filterFunction: @escaping FilterFunction = { $0.isActive }
    ) -> AnyPublisher<[User], Error> {
        retrieveFunction()
            .map { $0.filter(filterFunction) }
            .mapError { _ in Users.Error.someError }
            .eraseToAnyPublisher()
    }
}
```

## 2 : utiliser l’application partielle pour construire les dépendances

```swift
...
let retrieveUsersFunction: Users.RetrieveFunction = {
    return partializedFetchFunction()
        .mapError { $0 as Swift.Error }
        .eraseToAnyPublisher()
}
```

## 3 : injecter la dépendance

```swift
let users = Users.load(retrieveFunction: retrieveUsersFunction,
filterFunction: { $0.isActive })
```

La deuxième étape est la plus délicate, car elle demande un peu de plomberie et de code répétitif. Elle doit toutefois rester isolée dans les zones de votre code consacrées à l’injection de dépendances, comme les Assemblies de Swinject.

# Conclusion

Même si l’injection de structures de données traditionnelles convient parfaitement et respecte les bonnes pratiques, injecter des fonctions apporte deux avantages majeurs :

* cela révèle à quel point il est facile de divulguer les détails d’implémentation, et comment l’éviter. Moins nous en savons sur nos dépendances, mieux nous nous portons. Cela illustre parfaitement, je pense, la [loi de Déméter](https://fr.wikipedia.org/wiki/Loi_de_D%C3%A9m%C3%A9ter) ;
* cela rend les tests unitaires plus simples à écrire, à lire et à comprendre.

Utiliser des fonctions « partout » peut présenter quelques inconvénients, comme rendre les signatures difficiles à lire. Mais nous pouvons facilement les contourner grâce aux alias de types.

Utiliser des fonctions « partout » ouvre aussi la porte à la programmation fonctionnelle. L’application partielle nous en a donné un avant-goût, mais c’est tout un univers que vous devriez explorer progressivement.

Merci de m’avoir lu.

À suivre.

# Bonus : Swinject et l’injection de fonctions

Swinject est un framework d’injection de dépendances bien établi dans la communauté Swift. Il sert à enregistrer et à résoudre les « recettes » de construction de vos dépendances. Mais comment enregistrer et résoudre des fonctions ?

Rien ne ressemble plus à une fonction **`(String) -> String`** qu’une autre fonction **`(String) -> String`**, n’est-ce pas ?

Que se passe-t-il si nous devons résoudre une fonction enregistrée plusieurs fois avec la même signature ?

Swinject permet de distinguer les services enregistrés à l’aide d’un nom unique. Dans notre cas **`(String) -> String`**, nous aboutissons à quelque chose comme :

```swift
class MyAssembly: Assembly {
    func register(container: Container) {
        container.register(((String) -> String).self,
                           name: "StringFunction1") { _ in
                            return { param in
                                return param + "JAMES"
                            }
        }

        container.register(((String) -> String).self,
                           name: "StringFunction2") { _ in
                            return { param in
                                return param + "LEONARD"
                            }
        }
    }
}
```

Au moment de résoudre les dépendances :

```swift
let stringFunction1 = resolver.resolve(((String) -> String).self,
name: "StringFunction1")
```

Il n’y a rien de fondamentalement mauvais dans ce code, mais sa lecture n’est pas très agréable. Nous pouvons l’améliorer à l’aide d’un protocole qui regroupe la signature de la fonction et son nom :

```swift
public protocol NamedService {
    associatedtype Service
    static var type: Service.Type { get }
    static var name: String { get }
}

public extension NamedService {
    static var type: Service.Type {
        Service.self
    }

    static var name: String {
        "\(self)"
    }
}

// And then we can extend Swinject

public extension Container {
    @discardableResult
    func register<Service>(
        namedServiceType: Service.Type,
        factory: @escaping (Resolver) -> Service.Service
    ) -> ServiceEntry<Service.Service> where Service: NamedService {
        self.register(namedServiceType.type,
                      name: namedServiceType.name,
                      factory: factory)
    }
}

public extension Resolver {
    func resolve<Service>(
        namedServiceType: Service.Type
    ) -> Service.Service? where Service: NamedService {
        self.resolve(namedServiceType.type,
                     name: namedServiceType.name)
    }
}
```

Avec cette infrastructure, l’Assembly Swinject devient :

```swift
class MyAssembly: Assembly {

    enum StringFunction1: NamedService {
        typealias Service = (String) -> String
    }

    enum StringFunction2: NamedService {
        typealias Service = (String) -> String
    }

    func register(container: Container) {
        container.register(namedService: StringFunction1.self) { _ in
            return { param in
                return param + "JAMES"
            }
        }

        container.register(namedService: StringFunction2.self) { _ in
            return { param in
                return param + "LEONARD"
            }
        }
    }
}
```

Au moment de résoudre les dépendances :

```swift
let stringFunction1 = resolver.resolve(namedService: StringFunction1.self)
```

Même si le gain reste modeste, l’enregistrement et la résolution des fonctions ressemblent maintenant à l’utilisation de n’importe quelle structure de données traditionnelle. Nous éliminons ainsi un point de friction de l’injection de fonctions qui aurait pu vous empêcher d’essayer cette technique 😏.
